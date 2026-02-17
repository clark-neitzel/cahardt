import React, { useEffect, useState } from 'react';
import produtoService from '../../services/produtoService';
import configService from '../../services/configService'; // Import Service
import ProductCard from '../../components/ProductCard';
import { Search } from 'lucide-react';

const Catalogo = () => {
    const [produtos, setProdutos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // Configurações
    const [configuredCategories, setConfiguredCategories] = useState([]);
    const [configLoaded, setConfigLoaded] = useState(false);

    // Load Config on mount
    useEffect(() => {
        const loadConfig = async () => {
            try {
                const cats = await configService.get('categorias_vendas');
                setConfiguredCategories(Array.isArray(cats) ? cats : []);
            } catch (error) {
                console.error('Erro ao carregar configurações:', error);
            } finally {
                setConfigLoaded(true);
            }
        };
        loadConfig();
    }, []);

    const fetchProdutos = async () => {
        if (!configLoaded) return; // Wait for config

        setLoading(true);
        try {
            const params = { page, limit: 12, search, ativo: true };

            // Apply Category Filter if configured
            if (configuredCategories.length > 0) {
                params.categorias = configuredCategories.join(',');
            }

            const data = await produtoService.listar(params);
            setProdutos(data.data);
            setTotalPages(data.meta.totalPages);
        } catch (error) {
            console.error('Erro ao buscar produtos:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Debounce search
        const timeoutId = setTimeout(() => {
            setPage(1); // Reset page on search
            if (configLoaded) fetchProdutos();
        }, 500);
        return () => clearTimeout(timeoutId);
    }, [search, configLoaded]);

    useEffect(() => {
        if (configLoaded) fetchProdutos();
    }, [page, configLoaded]);

    return (
        <div className="container mx-auto px-4 py-6">
            <div className="mb-6 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                    type="text"
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm"
                    placeholder="Buscar produto por nome ou código..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {loading ? (
                <div className="flex justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {produtos.map((produto) => (
                            <ProductCard key={produto.id} produto={produto} />
                        ))}
                    </div>

                    {produtos.length === 0 && (
                        <div className="text-center py-10 text-gray-500">
                            Nenhum produto encontrado.
                        </div>
                    )}

                    {/* Paginação Simples */}
                    <div className="mt-6 flex justify-center space-x-2">
                        <button
                            disabled={page === 1}
                            onClick={() => setPage(p => p - 1)}
                            className="px-3 py-1 border rounded disabled:opacity-50"
                        >
                            Anterior
                        </button>
                        <span className="px-3 py-1">
                            Página {page} de {totalPages}
                        </span>
                        <button
                            disabled={page === totalPages}
                            onClick={() => setPage(p => p + 1)}
                            className="px-3 py-1 border rounded disabled:opacity-50"
                        >
                            Próxima
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default Catalogo;
