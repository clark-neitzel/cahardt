import { useState, useEffect, useCallback } from 'react';
import { Search, AlertTriangle, Package, ArrowUpCircle, ArrowDownCircle, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import pcpEstoqueService from '../../services/pcpEstoqueService';

const TIPO_CORES = {
    MP: 'bg-amber-100 text-amber-800',
    SUB: 'bg-purple-100 text-purple-800',
    PA: 'bg-green-100 text-green-800',
    EMB: 'bg-blue-100 text-blue-800',
};

export default function EstoquePcp() {
    const [itens, setItens] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [tipoFiltro, setTipoFiltro] = useState('');
    const [apenasAbaixo, setApenasAbaixo] = useState(false);
    const [modalAjuste, setModalAjuste] = useState(null);
    const [ajusteForm, setAjusteForm] = useState({ tipo: 'ENTRADA', quantidade: '', observacao: '' });
    const [salvandoAjuste, setSalvandoAjuste] = useState(false);

    const carregar = useCallback(async () => {
        try {
            setLoading(true);
            const params = {};
            if (search.trim()) params.search = search.trim();
            if (tipoFiltro) params.tipo = tipoFiltro;
            if (apenasAbaixo) params.apenasAbaixoMinimo = true;
            const data = await pcpEstoqueService.posicao(params);
            setItens(data);
        } catch (err) {
            toast.error('Erro ao carregar estoque PCP');
        } finally {
            setLoading(false);
        }
    }, [search, tipoFiltro, apenasAbaixo]);

    useEffect(() => { carregar(); }, [carregar]);

    const abrirAjuste = (item) => {
        setModalAjuste(item);
        setAjusteForm({ tipo: 'ENTRADA', quantidade: '', observacao: '' });
    };

    const salvarAjuste = async () => {
        if (!ajusteForm.quantidade || parseFloat(ajusteForm.quantidade) <= 0) {
            toast.error('Quantidade deve ser maior que zero');
            return;
        }
        setSalvandoAjuste(true);
        try {
            await pcpEstoqueService.ajustar({
                itemPcpId: modalAjuste.id,
                tipo: ajusteForm.tipo,
                quantidade: parseFloat(ajusteForm.quantidade),
                observacao: ajusteForm.observacao || null,
            });
            toast.success('Ajuste realizado');
            setModalAjuste(null);
            carregar();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        } finally {
            setSalvandoAjuste(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Estoque PCP</h1>
                <p className="text-sm text-gray-500 mt-1">Posicao de estoque de materias-primas, subprodutos e embalagens</p>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap gap-3 mb-4">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <select
                    value={tipoFiltro}
                    onChange={e => setTipoFiltro(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                    <option value="">Todos os tipos</option>
                    <option value="MP">Materia-Prima</option>
                    <option value="SUB">Subproduto</option>
                    <option value="PA">Produto Acabado</option>
                    <option value="EMB">Embalagem</option>
                </select>
                <label className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer">
                    <input
                        type="checkbox"
                        checked={apenasAbaixo}
                        onChange={e => setApenasAbaixo(e.target.checked)}
                        className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                    />
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    Abaixo do minimo
                </label>
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
                                <th className="text-left px-4 py-3 font-medium text-gray-600">Item</th>
                                <th className="text-center px-4 py-3 font-medium text-gray-600">Tipo</th>
                                <th className="text-center px-4 py-3 font-medium text-gray-600">Unidade</th>
                                <th className="text-right px-4 py-3 font-medium text-gray-600">Estoque Atual</th>
                                <th className="text-right px-4 py-3 font-medium text-gray-600">Minimo</th>
                                <th className="text-center px-4 py-3 font-medium text-gray-600">Ajuste</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {itens.map(item => {
                                const abaixo = parseFloat(item.estoqueMinimo) > 0 && parseFloat(item.estoqueAtual) < parseFloat(item.estoqueMinimo);
                                return (
                                    <tr key={item.id} className={`hover:bg-gray-50 ${abaixo ? 'bg-red-50' : ''}`}>
                                        <td className="px-4 py-3">
                                            <span className="font-medium text-gray-800">{item.nome}</span>
                                            <span className="ml-2 text-xs text-gray-400">{item.codigo}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_CORES[item.tipo]}`}>
                                                {item.tipo}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center text-gray-600">{item.unidade}</td>
                                        <td className={`px-4 py-3 text-right font-mono font-medium ${abaixo ? 'text-red-600' : 'text-gray-800'}`}>
                                            {parseFloat(item.estoqueAtual).toFixed(3)}
                                            {abaixo && <AlertTriangle className="inline h-3.5 w-3.5 ml-1 text-red-500" />}
                                        </td>
                                        <td className="px-4 py-3 text-right text-gray-500 font-mono">
                                            {parseFloat(item.estoqueMinimo).toFixed(3)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                onClick={() => abrirAjuste(item)}
                                                className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                                            >
                                                Ajustar
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal Ajuste */}
            {modalAjuste && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-800">Ajuste de Estoque</h3>
                            <button onClick={() => setModalAjuste(null)} className="p-1 text-gray-400 hover:text-gray-600">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <p className="text-sm text-gray-500 mb-4">{modalAjuste.nome} ({modalAjuste.codigo})</p>
                        <p className="text-sm text-gray-500 mb-4">Estoque atual: <strong>{parseFloat(modalAjuste.estoqueAtual).toFixed(3)} {modalAjuste.unidade}</strong></p>

                        <div className="flex gap-2 mb-4">
                            <button
                                onClick={() => setAjusteForm(prev => ({ ...prev, tipo: 'ENTRADA' }))}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    ajusteForm.tipo === 'ENTRADA' ? 'bg-green-100 text-green-800 ring-2 ring-green-300' : 'bg-gray-100 text-gray-600'
                                }`}
                            >
                                <ArrowUpCircle className="h-4 w-4" /> Entrada
                            </button>
                            <button
                                onClick={() => setAjusteForm(prev => ({ ...prev, tipo: 'SAIDA' }))}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    ajusteForm.tipo === 'SAIDA' ? 'bg-red-100 text-red-800 ring-2 ring-red-300' : 'bg-gray-100 text-gray-600'
                                }`}
                            >
                                <ArrowDownCircle className="h-4 w-4" /> Saida
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade ({modalAjuste.unidade})</label>
                                <input
                                    type="number"
                                    step="0.001"
                                    value={ajusteForm.quantidade}
                                    onChange={e => setAjusteForm(prev => ({ ...prev, quantidade: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                    placeholder="0.000"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Observacao</label>
                                <input
                                    type="text"
                                    value={ajusteForm.observacao}
                                    onChange={e => setAjusteForm(prev => ({ ...prev, observacao: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                    placeholder="Motivo do ajuste..."
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setModalAjuste(null)} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
                            <button
                                onClick={salvarAjuste}
                                disabled={salvandoAjuste}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                            >
                                {salvandoAjuste ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                Confirmar Ajuste
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
