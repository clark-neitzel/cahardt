import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Package, ToggleLeft, ToggleRight, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import pcpItemService from '../../services/pcpItemService';

const TIPO_CORES = {
    MP: 'bg-amber-100 text-amber-800',
    SUB: 'bg-purple-100 text-purple-800',
    PA: 'bg-green-100 text-green-800',
    EMB: 'bg-blue-100 text-blue-800',
};

export default function ItensPcp() {
    const navigate = useNavigate();
    const [itens, setItens] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [ativoFiltro, setAtivoFiltro] = useState('true');

    const carregar = useCallback(async () => {
        try {
            setLoading(true);
            const params = { tipo: 'SUB' };
            if (search.trim()) params.search = search.trim();
            if (ativoFiltro) params.ativo = ativoFiltro;
            const data = await pcpItemService.listar(params);
            setItens(Array.isArray(data) ? data : []);
        } catch (err) {
            toast.error('Erro ao carregar itens: ' + err.message);
        } finally {
            setLoading(false);
        }
    }, [search, ativoFiltro]);

    useEffect(() => { carregar(); }, [carregar]);

    const toggleAtivo = async (id) => {
        try {
            await pcpItemService.toggleAtivo(id);
            toast.success('Status alterado');
            carregar();
        } catch (err) {
            toast.error(err.message);
        }
    };

    return (
        <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Subprodutos (PCP)</h1>
                    <p className="text-sm text-gray-500 mt-1">Itens intermediarios de producao. MP, PA e EMB vem do cadastro de Produtos.</p>
                </div>
                <button
                    onClick={() => navigate('/pcp/itens/novo')}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    Novo Subproduto
                </button>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap gap-3 mb-4">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nome ou codigo..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
                <select
                    value={ativoFiltro}
                    onChange={e => setAtivoFiltro(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                    <option value="true">Ativos</option>
                    <option value="false">Inativos</option>
                    <option value="">Todos</option>
                </select>
            </div>

            {/* Tabela */}
            {loading ? (
                <div className="text-center py-12 text-gray-400">Carregando...</div>
            ) : itens.length === 0 ? (
                <div className="text-center py-12">
                    <Package className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500">Nenhum subproduto encontrado</p>
                    <p className="text-xs text-gray-400 mt-1">Crie subprodutos intermediarios para usar nas receitas</p>
                </div>
            ) : (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium text-gray-600">Codigo</th>
                                <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
                                <th className="text-center px-4 py-3 font-medium text-gray-600">Unidade</th>
                                <th className="text-right px-4 py-3 font-medium text-gray-600">Estoque</th>
                                <th className="text-right px-4 py-3 font-medium text-gray-600">Minimo</th>
                                <th className="text-center px-4 py-3 font-medium text-gray-600">Acoes</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {itens.map(item => {
                                const abaixoMin = parseFloat(item.estoqueMinimo) > 0 && parseFloat(item.estoqueAtual) < parseFloat(item.estoqueMinimo);
                                return (
                                    <tr key={item.id} className={`hover:bg-gray-50 ${!item.ativo ? 'opacity-50' : ''}`}>
                                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.codigo}</td>
                                        <td className="px-4 py-3">
                                            <span className="font-medium text-gray-800">{item.nome}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center text-gray-600">{item.unidade}</td>
                                        <td className={`px-4 py-3 text-right font-medium ${abaixoMin ? 'text-red-600' : 'text-gray-800'}`}>
                                            {parseFloat(item.estoqueAtual).toFixed(3)}
                                        </td>
                                        <td className="px-4 py-3 text-right text-gray-500">
                                            {parseFloat(item.estoqueMinimo).toFixed(3)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                <button
                                                    onClick={() => navigate(`/pcp/itens/${item.id}`)}
                                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                                    title="Editar"
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => toggleAtivo(item.id)}
                                                    className={`p-1.5 rounded ${item.ativo ? 'text-green-500 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                                                    title={item.ativo ? 'Desativar' : 'Ativar'}
                                                >
                                                    {item.ativo ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
