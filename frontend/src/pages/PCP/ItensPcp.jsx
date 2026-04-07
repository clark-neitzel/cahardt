import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Package, ToggleLeft, ToggleRight, Pencil, Filter } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import pcpItemService from '../../services/pcpItemService';

const TIPOS = [
    { value: '', label: 'Todos' },
    { value: 'MP', label: 'Materia-Prima' },
    { value: 'SUB', label: 'Subproduto' },
    { value: 'PA', label: 'Produto Acabado' },
    { value: 'EMB', label: 'Embalagem' },
];

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
    const [tipoFiltro, setTipoFiltro] = useState('');
    const [ativoFiltro, setAtivoFiltro] = useState('true');

    const carregar = useCallback(async () => {
        try {
            setLoading(true);
            const params = {};
            if (search.trim()) params.search = search.trim();
            if (tipoFiltro) params.tipo = tipoFiltro;
            if (ativoFiltro) params.ativo = ativoFiltro;
            const data = await pcpItemService.listar(params);
            setItens(data);
        } catch (err) {
            toast.error('Erro ao carregar itens: ' + err.message);
        } finally {
            setLoading(false);
        }
    }, [search, tipoFiltro, ativoFiltro]);

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
                    <h1 className="text-2xl font-bold text-gray-800">Itens PCP</h1>
                    <p className="text-sm text-gray-500 mt-1">Materias-primas, subprodutos, produtos acabados e embalagens</p>
                </div>
                <button
                    onClick={() => navigate('/pcp/itens/novo')}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    Novo Item
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
                    value={tipoFiltro}
                    onChange={e => setTipoFiltro(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                    {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
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

            {/* Contadores por tipo */}
            <div className="flex gap-2 mb-4">
                {['MP', 'SUB', 'PA', 'EMB'].map(tipo => {
                    const count = itens.filter(i => i.tipo === tipo).length;
                    return (
                        <button
                            key={tipo}
                            onClick={() => setTipoFiltro(tipoFiltro === tipo ? '' : tipo)}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                tipoFiltro === tipo ? TIPO_CORES[tipo] + ' ring-2 ring-offset-1 ring-gray-400' : TIPO_CORES[tipo] + ' opacity-70 hover:opacity-100'
                            }`}
                        >
                            {tipo} ({count})
                        </button>
                    );
                })}
            </div>

            {/* Tabela */}
            {loading ? (
                <div className="text-center py-12 text-gray-400">Carregando...</div>
            ) : itens.length === 0 ? (
                <div className="text-center py-12">
                    <Package className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500">Nenhum item encontrado</p>
                </div>
            ) : (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium text-gray-600">Codigo</th>
                                <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
                                <th className="text-center px-4 py-3 font-medium text-gray-600">Tipo</th>
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
                                            {item.produto && (
                                                <span className="ml-2 text-xs text-gray-400">vinculado</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_CORES[item.tipo]}`}>
                                                {item.tipo}
                                            </span>
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
