import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Package, Loader2 } from 'lucide-react';
import api from '../../services/api';

export default function CategoriasEstoque() {
    const [categorias, setCategorias] = useState([]);
    const [loading, setLoading] = useState(true);
    const [salvando, setSalvando] = useState(null); // nome da categoria sendo salva

    useEffect(() => { carregar(); }, []);

    const carregar = async () => {
        try {
            setLoading(true);
            const data = await api.get('/categorias-estoque').then(r => r.data);
            setCategorias(data);
        } catch {
            toast.error('Erro ao carregar categorias.');
        } finally {
            setLoading(false);
        }
    };

    const toggleControla = async (nome, valorAtual) => {
        setSalvando(nome);
        try {
            const res = await api.patch(`/categorias-estoque/${encodeURIComponent(nome)}`, {
                controlaEstoque: !valorAtual
            }).then(r => r.data);
            setCategorias(prev => prev.map(c =>
                c.nome === nome ? { ...c, controlaEstoque: res.controlaEstoque, id: res.id } : c
            ));
            toast.success(`${nome}: controle de estoque ${res.controlaEstoque ? 'ativado' : 'desativado'}.`);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erro ao salvar.');
        } finally {
            setSalvando(null);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Carregando categorias...</div>;

    return (
        <div className="container mx-auto px-4 py-8 max-w-2xl">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Controle de Estoque por Categoria</h1>
                <p className="text-gray-500 text-sm mt-1">
                    Ative o controle de estoque para as categorias desejadas (ex: Produto Acabado, Materia Prima).
                    Somente produtos dessas categorias terão reserva e disponível calculados.
                </p>
            </div>

            {categorias.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                    <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Nenhuma categoria encontrada nos produtos cadastrados.</p>
                </div>
            ) : (
                <div className="bg-white rounded-lg shadow border border-gray-200 divide-y divide-gray-100">
                    {categorias.map(cat => (
                        <div key={cat.nome} className="flex items-center justify-between px-5 py-4">
                            <div>
                                <p className="font-medium text-gray-900">{cat.nome}</p>
                                {cat.naoSalva && (
                                    <p className="text-xs text-gray-400">Detectada nos produtos — ainda não configurada</p>
                                )}
                            </div>
                            <button
                                onClick={() => toggleControla(cat.nome, cat.controlaEstoque)}
                                disabled={salvando === cat.nome}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none
                                    ${cat.controlaEstoque ? 'bg-green-500' : 'bg-gray-200'}
                                    ${salvando === cat.nome ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                title={cat.controlaEstoque ? 'Clique para desativar' : 'Clique para ativar'}
                            >
                                {salvando === cat.nome ? (
                                    <Loader2 className="h-3.5 w-3.5 text-white animate-spin mx-auto" />
                                ) : (
                                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform
                                        ${cat.controlaEstoque ? 'translate-x-6' : 'translate-x-1'}`}
                                    />
                                )}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
