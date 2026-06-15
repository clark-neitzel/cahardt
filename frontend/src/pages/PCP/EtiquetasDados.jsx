import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import etiquetaService from '../../services/etiquetaService';

export default function EtiquetasDados() {
    const navigate = useNavigate();
    const [lista, setLista] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState(
        () => localStorage.getItem('etiquetas_dados_search') || ''
    );
    const [ativoFiltro, setAtivoFiltro] = useState(
        () => localStorage.getItem('etiquetas_dados_ativo') ?? 'true'
    );

    const setSearchSalvo = (v) => { setSearch(v); localStorage.setItem('etiquetas_dados_search', v); };
    const setAtivoSalvo  = (v) => { setAtivoFiltro(v); localStorage.setItem('etiquetas_dados_ativo', v); };

    const carregar = useCallback(async () => {
        try {
            setLoading(true);
            const params = {};
            if (search.trim()) params.search = search.trim();
            if (ativoFiltro !== '') params.ativo = ativoFiltro;
            const data = await etiquetaService.listar(params);
            setLista(Array.isArray(data) ? data : []);
        } catch (err) {
            toast.error('Erro ao carregar etiquetas: ' + err.message);
        } finally {
            setLoading(false);
        }
    }, [search, ativoFiltro]);

    useEffect(() => { carregar(); }, [carregar]);

    const handleToggle = async (id) => {
        try {
            await etiquetaService.toggle(id);
            toast.success('Status alterado');
            carregar();
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handleRemover = async (id, nome) => {
        if (!confirm(`Remover etiqueta "${nome}"?`)) return;
        try {
            await etiquetaService.remover(id);
            toast.success('Etiqueta removida');
            carregar();
        } catch (err) {
            toast.error(err.message);
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-6">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Dados das Etiquetas</h1>
                    <p className="text-sm text-gray-500 mt-1">Cadastro de informações nutricionais e de rótulo dos produtos</p>
                </div>
                <button
                    onClick={() => navigate('/pcp/etiquetas/nova')}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    Nova Etiqueta
                </button>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap gap-3 mb-4">
                <div className="relative flex-1 min-w-[220px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nome ou código..."
                        value={search}
                        onChange={e => setSearchSalvo(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                </div>
                <select
                    value={ativoFiltro}
                    onChange={e => setAtivoSalvo(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                >
                    <option value="true">Ativos</option>
                    <option value="false">Inativos</option>
                    <option value="">Todos</option>
                </select>
            </div>

            {/* Tabela */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-400">Carregando...</div>
                ) : lista.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">
                        Nenhuma etiqueta encontrada.{' '}
                        <button onClick={() => navigate('/pcp/etiquetas/nova')} className="text-indigo-600 hover:underline">
                            Cadastrar primeira
                        </button>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="text-left px-4 py-3 font-semibold text-gray-600">Código</th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-600">Nome do Produto</th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Peso</th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Qtd. Emb.</th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Validade</th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                                <th className="text-right px-4 py-3 font-semibold text-gray-600">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {lista.map(et => (
                                <tr key={et.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-mono text-xs">
                                        <span className="text-indigo-600 font-semibold">
                                            {et.produto?.codigo || et.codigoProduto}
                                        </span>
                                        {et.produto?.codigo && et.produto.codigo !== et.codigoProduto && (
                                            <span className="block text-gray-400 text-[10px]">int: {et.codigoProduto}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 font-medium text-gray-800">
                                        {et.nomeProduto}
                                        {et.produto && (
                                            <span className="ml-2 text-xs text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">
                                                vinculado
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{et.pesoUnitario}g</td>
                                    <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{et.quantidadeEmbalagem} un</td>
                                    <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{et.validadeDias} dias</td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                            et.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                                        }`}>
                                            {et.ativo ? 'Ativo' : 'Inativo'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => navigate(`/pcp/etiquetas/${et.id}/imprimir`)}
                                                className="p-1.5 text-gray-400 hover:text-indigo-600 rounded"
                                                title="Imprimir etiqueta"
                                            >
                                                <Printer className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => navigate(`/pcp/etiquetas/${et.id}/editar`)}
                                                className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                                                title="Editar"
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleToggle(et.id)}
                                                className="p-1.5 text-gray-400 hover:text-yellow-600 rounded"
                                                title={et.ativo ? 'Inativar' : 'Ativar'}
                                            >
                                                {et.ativo
                                                    ? <ToggleRight className="h-4 w-4 text-green-500" />
                                                    : <ToggleLeft className="h-4 w-4" />
                                                }
                                            </button>
                                            <button
                                                onClick={() => handleRemover(et.id, et.nomeProduto)}
                                                className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                                                title="Remover"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <p className="text-xs text-gray-400 mt-3">{lista.length} etiqueta(s) encontrada(s)</p>
        </div>
    );
}
