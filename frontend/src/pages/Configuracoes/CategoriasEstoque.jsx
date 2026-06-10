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
        setSalvando(nome + '_estoque');
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

    const toggleFlex = async (nome, valorAtual) => {
        setSalvando(nome + '_flex');
        try {
            const res = await api.patch(`/categorias-estoque/${encodeURIComponent(nome)}`, {
                contabilizaFlex: !valorAtual
            }).then(r => r.data);
            setCategorias(prev => prev.map(c =>
                c.nome === nome ? { ...c, contabilizaFlex: res.contabilizaFlex, id: res.id } : c
            ));
            toast.success(`${nome}: flex ${res.contabilizaFlex ? 'incluído' : 'excluído'}.`);
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
                <h1 className="text-2xl font-bold text-gray-800">Categorias do Conta Azul</h1>
                <p className="text-gray-500 text-sm mt-1">
                    Configure o controle de estoque e as regras de flex por categoria (ex: Produto Acabado, Materia Prima).
                </p>
            </div>

            {categorias.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                    <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Nenhuma categoria encontrada nos produtos cadastrados.</p>
                </div>
            ) : (
                <div className="bg-white rounded-lg shadow border border-gray-200 divide-y divide-gray-100">
                    {/* Cabeçalho */}
                    <div className="flex items-center justify-between px-5 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        <span>Categoria</span>
                        <div className="flex items-center gap-8">
                            <span>Estoque</span>
                            <span>Flex</span>
                        </div>
                    </div>
                    {categorias.map(cat => {
                        const contabilizaFlex = cat.contabilizaFlex !== false; // default true
                        return (
                            <div key={cat.nome} className="flex items-center justify-between px-5 py-4">
                                <div>
                                    <p className="font-medium text-gray-900">{cat.nome}</p>
                                    {cat.naoSalva && (
                                        <p className="text-xs text-gray-400">Detectada nos produtos — ainda não configurada</p>
                                    )}
                                    {!contabilizaFlex && (
                                        <p className="text-xs text-orange-500 font-medium">Excluída do cálculo de flex</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-8">
                                    {/* Toggle Estoque */}
                                    <button
                                        onClick={() => toggleControla(cat.nome, cat.controlaEstoque)}
                                        disabled={salvando === cat.nome + '_estoque'}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none
                                            ${cat.controlaEstoque ? 'bg-green-500' : 'bg-gray-200'}
                                            ${salvando === cat.nome + '_estoque' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                        title={cat.controlaEstoque ? 'Estoque: ativo' : 'Estoque: inativo'}
                                    >
                                        {salvando === cat.nome + '_estoque' ? (
                                            <Loader2 className="h-3.5 w-3.5 text-white animate-spin mx-auto" />
                                        ) : (
                                            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${cat.controlaEstoque ? 'translate-x-6' : 'translate-x-1'}`} />
                                        )}
                                    </button>
                                    {/* Toggle Flex */}
                                    <button
                                        onClick={() => toggleFlex(cat.nome, contabilizaFlex)}
                                        disabled={salvando === cat.nome + '_flex'}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none
                                            ${contabilizaFlex ? 'bg-violet-500' : 'bg-gray-200'}
                                            ${salvando === cat.nome + '_flex' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                        title={contabilizaFlex ? 'Flex: incluído no cálculo' : 'Flex: excluído do cálculo'}
                                    >
                                        {salvando === cat.nome + '_flex' ? (
                                            <Loader2 className="h-3.5 w-3.5 text-white animate-spin mx-auto" />
                                        ) : (
                                            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${contabilizaFlex ? 'translate-x-6' : 'translate-x-1'}`} />
                                        )}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
