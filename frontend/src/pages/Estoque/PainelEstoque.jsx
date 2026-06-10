import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Minus, Search, Package, AlertCircle, Loader2, History, AlertTriangle, Unlock, X, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import estoqueService from '../../services/estoqueService';
import { useAuth } from '../../contexts/AuthContext';

// ─── Card de produto ──────────────────────────────────────────────────────────

function ProdutoCard({ produto, isSelected, onEscolher, lancamentoHoje }) {
    const entradas = lancamentoHoje?.entradas ?? 0;
    const saidas = lancamentoHoje?.saidas ?? 0;
    const abaixoMin = (produto.estoqueMinimo || 0) > 0 &&
        parseFloat(produto.estoqueDisponivel || 0) < parseFloat(produto.estoqueMinimo || 0);

    return (
        <div
            className={`bg-white border rounded-xl p-3 flex flex-col gap-2 cursor-pointer transition-all ${
                isSelected
                    ? 'border-blue-500 ring-2 ring-blue-200 shadow-md'
                    : 'border-gray-200 hover:border-blue-300 hover:shadow-md'
            }`}
            onClick={() => onEscolher(produto)}
        >
            <div className="flex items-start justify-between gap-1">
                <div className="min-w-0 flex-1">
                    <span className="inline-block text-xs font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded mb-1">
                        {produto.codigo || '—'}
                    </span>
                    <h3 className="font-bold text-gray-900 text-xs leading-tight line-clamp-2">{produto.nome}</h3>
                </div>
                {abaixoMin && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />}
            </div>

            <div className="text-xs space-y-0.5">
                <div className="flex justify-between">
                    <span className="text-gray-400">Disponível</span>
                    <span className={`font-semibold ${abaixoMin ? 'text-amber-600' : 'text-blue-700'}`}>
                        {Number(produto.estoqueDisponivel || 0).toFixed(0)} {produto.unidade}
                    </span>
                </div>
                {entradas > 0 && (
                    <div className="flex justify-between">
                        <span className="text-gray-400">Entrada hoje</span>
                        <span className="font-semibold text-green-600">+{entradas.toFixed(0)}</span>
                    </div>
                )}
                {saidas > 0 && (
                    <div className="flex justify-between">
                        <span className="text-gray-400">Saída hoje</span>
                        <span className="font-semibold text-red-500">-{saidas.toFixed(0)}</span>
                    </div>
                )}
            </div>

            <button
                onClick={e => { e.stopPropagation(); onEscolher(produto); }}
                className={`w-full flex items-center justify-center py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    isSelected
                        ? 'bg-blue-600 text-white'
                        : 'bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white'
                }`}
            >
                {isSelected ? 'Selecionado' : 'Escolher'}
            </button>
        </div>
    );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function PainelEstoque() {
    const { user } = useAuth();
    const navigate = useNavigate();

    // Lista de produtos
    const [todos, setTodos] = useState([]);
    const [loadingProdutos, setLoadingProdutos] = useState(true);
    const [search, setSearch] = useState('');
    const [categoriaSel, setCategoriaSel] = useState(
        () => localStorage.getItem('estoque_ajuste_cat') || null
    );
    const [lancamentosHoje, setLancamentosHoje] = useState({});

    // Form de ajuste
    const [produtoSelecionado, setProdutoSelecionado] = useState(null);
    const [quantidade, setQuantidade] = useState('');
    const [observacao, setObservacao] = useState('');
    const [loadingAjuste, setLoadingAjuste] = useState(false);
    const [permissoes, setPermissoes] = useState(null);
    const [editandoMinimo, setEditandoMinimo] = useState(false);
    const [estoqueMinimo, setEstoqueMinimo] = useState('');
    const [salvandoMinimo, setSalvandoMinimo] = useState(false);

    const formRef = useRef(null);
    const isAdmin = user?.permissoes?.admin === true;

    // Carrega permissões
    useEffect(() => {
        estoqueService.getPermissoes()
            .then(setPermissoes)
            .catch(() => setPermissoes({ admin: false, regras: [] }));
    }, []);

    // Carrega todos os produtos (após permissões)
    const carregarProdutos = useCallback(async () => {
        if (!permissoes) return;
        setLoadingProdutos(true);
        try {
            const data = await estoqueService.getPosicao();
            setTodos(Array.isArray(data) ? data : []);
        } catch {
            toast.error('Erro ao carregar produtos.');
        } finally {
            setLoadingProdutos(false);
        }
    }, [permissoes]);

    useEffect(() => { carregarProdutos(); }, [carregarProdutos]);

    // Carrega movimentos de hoje para exibir nos cards
    const carregarLancamentosHoje = useCallback(async () => {
        try {
            const hoje = new Date().toISOString().split('T')[0];
            const res = await estoqueService.listarHistorico({ dataInicio: hoje, dataFim: hoje, tamanhoPagina: 1000 });
            const movs = res.items || [];
            const mapa = {};
            movs.forEach(m => {
                if (!mapa[m.produtoId]) mapa[m.produtoId] = { entradas: 0, saidas: 0 };
                if (m.tipo === 'ENTRADA') mapa[m.produtoId].entradas += Number(m.quantidade || 0);
                else if (m.tipo === 'SAIDA') mapa[m.produtoId].saidas += Number(m.quantidade || 0);
            });
            setLancamentosHoje(mapa);
        } catch (err) {
            console.error('[Estoque] Erro ao carregar lançamentos de hoje:', err);
        }
    }, []);

    useEffect(() => { carregarLancamentosHoje(); }, [carregarLancamentosHoje]);

    // Categorias comerciais únicas dos produtos carregados
    const categorias = [...new Map(
        todos
            .filter(p => p.categoriaProduto)
            .map(p => [p.categoriaProduto.id, p.categoriaProduto])
    ).values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    // Filtragem client-side — apenas produtos do catálogo (com categoria comercial)
    const filtrados = todos.filter(p => {
        if (!p.categoriaProduto) return false;
        if (categoriaSel && p.categoriaProduto.id !== categoriaSel) return false;
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return p.nome.toLowerCase().includes(q) || (p.codigo || '').toLowerCase().includes(q);
    });

    const selecionarCategoria = (id) => {
        setCategoriaSel(id);
        if (id) localStorage.setItem('estoque_ajuste_cat', id);
        else localStorage.removeItem('estoque_ajuste_cat');
    };

    const selecionarProduto = (produto) => {
        setProdutoSelecionado(produto);
        setQuantidade('');
        setObservacao('');
        setEditandoMinimo(false);
        setEstoqueMinimo(String(produto.estoqueMinimo ?? '0'));
        // Mobile: rola para o formulário
        setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    };

    const limparSelecao = () => {
        setProdutoSelecionado(null);
        setQuantidade('');
        setObservacao('');
        setEditandoMinimo(false);
    };

    const podeFazer = (tipo) => {
        if (!permissoes) return false;
        if (permissoes.admin) return true;
        const regras = permissoes.regras || [];
        const acao = tipo === 'ENTRADA' ? 'adicionar' : 'diminuir';
        if (!produtoSelecionado) return regras.some(r => Array.isArray(r.pode) && r.pode.includes(acao));
        return regras.some(r => {
            const catOk = !r.categoria || r.categoria === produtoSelecionado.categoria;
            return catOk && Array.isArray(r.pode) && r.pode.includes(acao);
        });
    };

    const handleAjuste = async (tipo) => {
        if (!produtoSelecionado) return toast.error('Selecione um produto.');
        const qtd = parseFloat(quantidade);
        if (!qtd || qtd <= 0) return toast.error('Informe uma quantidade válida.');
        if (!podeFazer(tipo)) return toast.error('Você não tem permissão para esta operação.');

        setLoadingAjuste(true);
        try {
            const res = await estoqueService.ajustar({
                produtoId: produtoSelecionado.id,
                tipo,
                quantidade: qtd,
                observacao: observacao || undefined
            });

            const atualizado = {
                ...produtoSelecionado,
                estoqueTotal: res.estoqueTotal,
                estoqueReservado: res.estoqueReservado,
                estoqueDisponivel: res.estoqueDisponivel
            };
            setProdutoSelecionado(atualizado);

            // Atualiza o card na lista também
            setTodos(prev => prev.map(p => p.id === produtoSelecionado.id ? { ...p, ...atualizado } : p));

            // Atualiza lançamentos de hoje
            setLancamentosHoje(prev => {
                const cur = prev[produtoSelecionado.id] || { entradas: 0, saidas: 0 };
                return {
                    ...prev,
                    [produtoSelecionado.id]: tipo === 'ENTRADA'
                        ? { ...cur, entradas: cur.entradas + qtd }
                        : { ...cur, saidas: cur.saidas + qtd }
                };
            });

            setQuantidade('');
            setObservacao('');

            const label = tipo === 'ENTRADA' ? 'Entrada' : 'Saída';
            toast.success(
                `${label} registrada! Disponível: ${Number(res.estoqueDisponivel).toFixed(0)} ${produtoSelecionado.unidade || 'un'}`,
                { duration: 3000 }
            );
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erro ao ajustar estoque.');
        } finally {
            setLoadingAjuste(false);
        }
    };

    const handleSalvarMinimo = async () => {
        if (!produtoSelecionado) return;
        const val = parseFloat(estoqueMinimo);
        if (isNaN(val) || val < 0) return toast.error('Valor de mínimo inválido.');
        setSalvandoMinimo(true);
        try {
            const res = await estoqueService.atualizarMinimo(produtoSelecionado.id, val);
            const atualizado = { ...produtoSelecionado, estoqueMinimo: res.estoqueMinimo };
            setProdutoSelecionado(atualizado);
            setTodos(prev => prev.map(p => p.id === produtoSelecionado.id ? { ...p, estoqueMinimo: res.estoqueMinimo } : p));
            setEditandoMinimo(false);
            toast.success('Estoque mínimo atualizado.');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erro ao salvar estoque mínimo.');
        } finally {
            setSalvandoMinimo(false);
        }
    };

    const podeEntrada = podeFazer('ENTRADA');
    const podeSaida = podeFazer('SAIDA');
    const estoqueMin = parseFloat(produtoSelecionado?.estoqueMinimo || 0);
    const estoqueDisp = parseFloat(produtoSelecionado?.estoqueDisponivel || 0);
    const abaixoMinimo = estoqueMin > 0 && estoqueDisp < estoqueMin;

    return (
        <div className="max-w-7xl mx-auto px-4 py-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Ajuste de Estoque</h1>
                    <p className="text-sm text-gray-500 mt-0.5">Produção / Estoque</p>
                </div>
                <button
                    onClick={() => navigate('/estoque/historico')}
                    className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                    <History className="h-4 w-4" />
                    Histórico
                </button>
            </div>

            {/* Layout split: lista à esquerda, formulário à direita */}
            <div className="flex flex-col lg:flex-row gap-5">

                {/* PAINEL ESQUERDO — lista de produtos */}
                <div className={`lg:w-[58%] ${produtoSelecionado ? 'hidden lg:block' : ''}`}>

                    {/* Busca */}
                    <div className="relative mb-2">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar por nome ou código..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                            autoComplete="off"
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100">
                                <X className="h-4 w-4 text-gray-400" />
                            </button>
                        )}
                    </div>

                    {/* Filtros de categoria comercial */}
                    {categorias.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                            <button
                                onClick={() => selecionarCategoria(null)}
                                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                                    categoriaSel === null
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-300'
                                        : 'bg-white text-gray-500 border-gray-300 hover:border-blue-400 hover:text-blue-600'
                                }`}
                            >
                                Todos
                            </button>
                            {categorias.map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={() => selecionarCategoria(categoriaSel === cat.id ? null : cat.id)}
                                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                                        categoriaSel === cat.id
                                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-300'
                                            : 'bg-white text-gray-500 border-gray-300 hover:border-blue-400 hover:text-blue-600'
                                    }`}
                                >
                                    {cat.nome}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Contador */}
                    {!loadingProdutos && (
                        <p className="text-xs text-gray-400 mb-3">
                            {filtrados.length} produto(s){categoriaSel || search ? ' filtrado(s)' : ''}
                        </p>
                    )}

                    {/* Grid de cards */}
                    {loadingProdutos ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {Array.from({ length: 9 }).map((_, i) => (
                                <div key={i} className="bg-gray-100 rounded-xl h-28 animate-pulse" />
                            ))}
                        </div>
                    ) : filtrados.length === 0 ? (
                        <div className="text-center py-16 text-gray-400">
                            <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">{search ? 'Nenhum produto encontrado' : 'Nenhum produto disponível'}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {filtrados.map(p => (
                                <ProdutoCard
                                    key={p.id}
                                    produto={p}
                                    isSelected={produtoSelecionado?.id === p.id}
                                    onEscolher={selecionarProduto}
                                    lancamentoHoje={lancamentosHoje[p.id] || null}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* PAINEL DIREITO — formulário de ajuste */}
                <div ref={formRef} className="lg:w-[42%]">

                    {/* Botão voltar (mobile) */}
                    {produtoSelecionado && (
                        <button
                            onClick={limparSelecao}
                            className="lg:hidden flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3"
                        >
                            <ChevronLeft className="h-4 w-4" />
                            Voltar à lista
                        </button>
                    )}

                    <div className="lg:sticky lg:top-4">
                        {produtoSelecionado ? (
                            <div className="space-y-4">
                                {/* Card do produto selecionado */}
                                <div className={`border rounded-xl p-4 ${abaixoMinimo ? 'bg-amber-50 border-amber-300' : 'bg-blue-50 border-blue-200'}`}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="font-semibold text-gray-900 leading-snug">{produtoSelecionado.nome}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                {produtoSelecionado.codigo || '—'} · {produtoSelecionado.categoria || 'sem categoria'}
                                            </p>
                                        </div>
                                        <button
                                            onClick={limparSelecao}
                                            className="hidden lg:block text-gray-400 hover:text-gray-600 text-xl font-light shrink-0 leading-none mt-0.5"
                                        >×</button>
                                    </div>

                                    {/* 3 estados de estoque */}
                                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                        <div className="bg-white rounded-lg p-2 border border-gray-200">
                                            <p className="text-xs text-gray-500 mb-0.5">Total</p>
                                            <p className="text-base font-bold text-gray-800">
                                                {Number(produtoSelecionado.estoqueTotal || 0).toFixed(0)}
                                            </p>
                                        </div>
                                        <div className="bg-white rounded-lg p-2 border border-orange-200">
                                            <p className="text-xs text-orange-600 mb-0.5">Reservado</p>
                                            <p className="text-base font-bold text-orange-600">
                                                {Number(produtoSelecionado.estoqueReservado || 0).toFixed(0)}
                                            </p>
                                        </div>
                                        <div className={`bg-white rounded-lg p-2 border ${abaixoMinimo ? 'border-amber-400' : 'border-blue-200'}`}>
                                            <p className={`text-xs mb-0.5 ${abaixoMinimo ? 'text-amber-600' : 'text-blue-600'}`}>Disponível</p>
                                            <p className={`text-base font-bold ${abaixoMinimo ? 'text-amber-600' : 'text-blue-700'}`}>
                                                {Number(produtoSelecionado.estoqueDisponivel || 0).toFixed(0)}
                                            </p>
                                        </div>
                                    </div>
                                    <p className="text-xs text-center text-gray-400 mt-1">{produtoSelecionado.unidade || 'un'}</p>

                                    {abaixoMinimo && (
                                        <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-700">
                                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                            Abaixo do mínimo ({Number(estoqueMin).toFixed(0)} {produtoSelecionado.unidade || 'un'})
                                        </div>
                                    )}

                                    {isAdmin && (
                                        <div className="mt-3 flex items-center gap-2">
                                            <span className="text-xs text-gray-500">Mínimo:</span>
                                            {editandoMinimo ? (
                                                <>
                                                    <input
                                                        type="number"
                                                        value={estoqueMinimo}
                                                        onChange={e => setEstoqueMinimo(e.target.value)}
                                                        className="w-20 px-2 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                                                        min="0"
                                                        step="1"
                                                        inputMode="decimal"
                                                    />
                                                    <button
                                                        onClick={handleSalvarMinimo}
                                                        disabled={salvandoMinimo}
                                                        className="text-xs text-blue-600 font-medium hover:text-blue-800 disabled:opacity-50"
                                                    >
                                                        {salvandoMinimo ? 'Salvando...' : 'Salvar'}
                                                    </button>
                                                    <button onClick={() => setEditandoMinimo(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="text-xs font-medium text-gray-700">{Number(produtoSelecionado.estoqueMinimo || 0).toFixed(0)} {produtoSelecionado.unidade || 'un'}</span>
                                                    <button
                                                        onClick={() => { setEditandoMinimo(true); setEstoqueMinimo(String(produtoSelecionado.estoqueMinimo ?? '0')); }}
                                                        className="text-xs text-gray-400 hover:text-blue-500 flex items-center gap-0.5"
                                                        title="Editar estoque mínimo"
                                                    >
                                                        <Unlock className="h-3 w-3" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Quantidade */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Quantidade</label>
                                    <input
                                        type="number"
                                        value={quantidade}
                                        onChange={e => setQuantidade(e.target.value)}
                                        placeholder="0"
                                        min="0"
                                        step="0.001"
                                        className="w-full px-4 py-3 border border-gray-300 rounded-xl text-center text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        inputMode="decimal"
                                    />
                                </div>

                                {/* Observação */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                        Observação <span className="text-gray-400 font-normal">(opcional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={observacao}
                                        onChange={e => setObservacao(e.target.value)}
                                        placeholder="Ex: ajuste de inventário, devolução..."
                                        className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>

                                {/* Botões Saída / Entrada */}
                                <div className="grid grid-cols-2 gap-3 pt-1">
                                    <button
                                        onClick={() => handleAjuste('SAIDA')}
                                        disabled={!podeSaida || loadingAjuste}
                                        title={!podeSaida ? 'Sem permissão para diminuir estoque nesta categoria' : ''}
                                        className={`flex items-center justify-center gap-2 py-4 rounded-xl text-base font-bold transition-all ${
                                            podeSaida && !loadingAjuste
                                                ? 'bg-red-500 hover:bg-red-600 text-white shadow-sm active:scale-95'
                                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                        }`}
                                    >
                                        {loadingAjuste ? <Loader2 className="h-5 w-5 animate-spin" /> : <Minus className="h-5 w-5" />}
                                        Saída
                                    </button>
                                    <button
                                        onClick={() => handleAjuste('ENTRADA')}
                                        disabled={!podeEntrada || loadingAjuste}
                                        title={!podeEntrada ? 'Sem permissão para adicionar estoque nesta categoria' : ''}
                                        className={`flex items-center justify-center gap-2 py-4 rounded-xl text-base font-bold transition-all ${
                                            podeEntrada && !loadingAjuste
                                                ? 'bg-green-500 hover:bg-green-600 text-white shadow-sm active:scale-95'
                                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                        }`}
                                    >
                                        {loadingAjuste ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
                                        Entrada
                                    </button>
                                </div>

                                {/* Aviso de permissão */}
                                {!podeEntrada && !podeSaida && (
                                    <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                                        <AlertCircle className="h-4 w-4 shrink-0" />
                                        Você não tem permissão para ajustar estoque nesta categoria.
                                    </div>
                                )}
                                {(podeEntrada || podeSaida) && (
                                    <p className="text-xs text-center text-gray-400">
                                        {podeEntrada && podeSaida
                                            ? 'Você pode adicionar e diminuir estoque nesta categoria.'
                                            : podeEntrada
                                                ? 'Você pode apenas adicionar estoque nesta categoria.'
                                                : 'Você pode apenas diminuir estoque nesta categoria.'}
                                    </p>
                                )}
                            </div>
                        ) : (
                            // Desktop: placeholder quando nenhum produto está selecionado
                            <div className="hidden lg:flex flex-col items-center justify-center min-h-[320px] border-2 border-dashed border-gray-200 rounded-2xl text-gray-400">
                                <Package className="h-12 w-12 mb-3 opacity-30" />
                                <p className="text-sm text-center px-6">Selecione um produto na lista ao lado para ajustar o estoque.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
