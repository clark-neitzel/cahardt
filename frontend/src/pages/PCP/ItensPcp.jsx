import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Package, ToggleLeft, ToggleRight, Pencil, Download, X, Loader2, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import pcpItemService from '../../services/pcpItemService';
import api from '../../services/api';

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

    // Modal importar
    const [modalImportar, setModalImportar] = useState(false);
    const [produtos, setProdutos] = useState([]);
    const [produtosBusca, setProdutosBusca] = useState('');
    const [tipoImportar, setTipoImportar] = useState('MP');
    const [selecionados, setSelecionados] = useState(new Set());
    const [importando, setImportando] = useState(false);
    const [carregandoProdutos, setCarregandoProdutos] = useState(false);

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

    // Abrir modal de importacao
    const abrirModalImportar = async () => {
        setModalImportar(true);
        setSelecionados(new Set());
        setProdutosBusca('');
        setTipoImportar('MP');
        setCarregandoProdutos(true);
        try {
            const r = await api.get('/produtos', { params: { ativo: true } });
            setProdutos(r.data || []);
        } catch {
            toast.error('Erro ao carregar produtos');
        } finally {
            setCarregandoProdutos(false);
        }
    };

    // Filtrar produtos ja importados
    const produtosJaImportados = new Set(itens.filter(i => i.produtoId).map(i => i.produtoId));

    const produtosFiltrados = produtos.filter(p => {
        if (produtosBusca.trim()) {
            const q = produtosBusca.trim().toLowerCase();
            return (p.nome?.toLowerCase().includes(q) || p.codigo?.toLowerCase().includes(q));
        }
        return true;
    });

    const toggleSelecionado = (id) => {
        setSelecionados(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const importarSelecionados = async () => {
        if (selecionados.size === 0) {
            toast.error('Selecione ao menos um produto');
            return;
        }
        setImportando(true);
        try {
            const itensParaImportar = Array.from(selecionados).map(produtoId => ({ produtoId, tipo: tipoImportar }));
            const resultados = await pcpItemService.importarLote(itensParaImportar);
            const sucessos = resultados.filter(r => r.sucesso).length;
            const erros = resultados.filter(r => !r.sucesso);

            if (sucessos > 0) toast.success(`${sucessos} produto(s) importado(s)`);
            if (erros.length > 0) {
                erros.forEach(e => toast.error(e.erro, { duration: 4000 }));
            }

            setModalImportar(false);
            carregar();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        } finally {
            setImportando(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Itens PCP</h1>
                    <p className="text-sm text-gray-500 mt-1">MP, PA e EMB vem do cadastro de Produtos. SUB e criado aqui.</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={abrirModalImportar}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                        <Download className="h-4 w-4" />
                        Importar do Cadastro
                    </button>
                    <button
                        onClick={() => navigate('/pcp/itens/novo')}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                    >
                        <Plus className="h-4 w-4" />
                        Novo Subproduto
                    </button>
                </div>
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
                                <th className="text-center px-4 py-3 font-medium text-gray-600">Origem</th>
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
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_CORES[item.tipo]}`}>
                                                {item.tipo}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {item.produtoId ? (
                                                <span className="text-xs text-green-600 font-medium">Cadastro</span>
                                            ) : (
                                                <span className="text-xs text-purple-600 font-medium">PCP</span>
                                            )}
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

            {/* Modal Importar do Cadastro */}
            {modalImportar && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
                        <div className="flex items-center justify-between p-5 border-b">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-800">Importar do Cadastro de Produtos</h3>
                                <p className="text-xs text-gray-400 mt-1">Selecione produtos para usar como MP, PA ou EMB no PCP</p>
                            </div>
                            <button onClick={() => setModalImportar(false)} className="p-1 text-gray-400 hover:text-gray-600">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="p-4 border-b space-y-3">
                            <div className="flex gap-3">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Buscar produto..."
                                        value={produtosBusca}
                                        onChange={e => setProdutosBusca(e.target.value)}
                                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
                                    />
                                </div>
                                <select
                                    value={tipoImportar}
                                    onChange={e => setTipoImportar(e.target.value)}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium"
                                >
                                    <option value="MP">Materia-Prima (MP)</option>
                                    <option value="PA">Produto Acabado (PA)</option>
                                    <option value="EMB">Embalagem (EMB)</option>
                                </select>
                            </div>
                            {selecionados.size > 0 && (
                                <div className="text-sm text-blue-600 font-medium">
                                    {selecionados.size} produto(s) selecionado(s)
                                </div>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto p-2">
                            {carregandoProdutos ? (
                                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
                            ) : produtosFiltrados.length === 0 ? (
                                <div className="text-center py-8 text-gray-400 text-sm">Nenhum produto encontrado</div>
                            ) : (
                                <div className="space-y-1">
                                    {produtosFiltrados.map(p => {
                                        const jaImportado = produtosJaImportados.has(p.id);
                                        const sel = selecionados.has(p.id);
                                        return (
                                            <button
                                                key={p.id}
                                                disabled={jaImportado}
                                                onClick={() => toggleSelecionado(p.id)}
                                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                                                    jaImportado
                                                        ? 'opacity-40 cursor-not-allowed bg-gray-50'
                                                        : sel
                                                            ? 'bg-blue-50 ring-1 ring-blue-300'
                                                            : 'hover:bg-gray-50'
                                                }`}
                                            >
                                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                                                    sel ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                                                }`}>
                                                    {sel && <Check className="h-3 w-3 text-white" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <span className="font-medium text-gray-800">{p.nome}</span>
                                                    <span className="ml-2 text-xs text-gray-400">{p.codigo}</span>
                                                </div>
                                                <span className="text-xs text-gray-400">{p.unidade}</span>
                                                {jaImportado && <span className="text-xs text-green-600 font-medium shrink-0">Ja importado</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="flex justify-between items-center p-4 border-t">
                            <button onClick={() => setModalImportar(false)} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
                            <button
                                onClick={importarSelecionados}
                                disabled={importando || selecionados.size === 0}
                                className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                            >
                                {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                Importar {selecionados.size > 0 ? `(${selecionados.size})` : ''}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
