import { useState, useEffect, useRef } from 'react';
import { Plus, Minus, Search, Package, CheckCircle, AlertCircle, Loader2, History } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../services/api';
import estoqueService from '../../services/estoqueService';
import { useAuth } from '../../contexts/AuthContext';

export default function PainelEstoque() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [busca, setBusca] = useState('');
    const [produtos, setProdutos] = useState([]);
    const [produtoSelecionado, setProdutoSelecionado] = useState(null);
    const [quantidade, setQuantidade] = useState('');
    const [observacao, setObservacao] = useState('');
    const [loadingBusca, setLoadingBusca] = useState(false);
    const [loadingAjuste, setLoadingAjuste] = useState(false);
    const [permissoes, setPermissoes] = useState(null);
    const [buscaFeita, setBuscaFeita] = useState(false);
    const [erroBusca, setErroBusca] = useState(null);
    const buscaTimeout = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        estoqueService.getPermissoes()
            .then(setPermissoes)
            .catch(() => setPermissoes({ admin: false, regras: [] }));
    }, []);

    // Busca produtos por nome ou EAN (código de barras)
    useEffect(() => {
        if (!busca.trim()) {
            setProdutos([]);
            setBuscaFeita(false);
            setErroBusca(null);
            return;
        }
        clearTimeout(buscaTimeout.current);
        buscaTimeout.current = setTimeout(async () => {
            setLoadingBusca(true);
            setErroBusca(null);
            try {
                const data = await api.get('/produtos', { params: { search: busca.trim(), limit: 20 } }).then(r => r.data);
                const lista = Array.isArray(data) ? data : (data.data || data.produtos || data.items || []);
                setProdutos(lista);
                setBuscaFeita(true);
            } catch (err) {
                console.error('[Estoque busca]', err);
                setProdutos([]);
                setBuscaFeita(true);
                setErroBusca(err.response?.data?.error || 'Erro ao buscar produtos.');
            } finally {
                setLoadingBusca(false);
            }
        }, 350);
    }, [busca]);

    const selecionarProduto = (produto) => {
        setProdutoSelecionado(produto);
        setProdutos([]);
        setBusca(produto.nome);
        setBuscaFeita(false);
        setErroBusca(null);
        setQuantidade('');
        setObservacao('');
    };

    const limparSelecao = () => {
        setProdutoSelecionado(null);
        setBusca('');
        setProdutos([]);
        setBuscaFeita(false);
        setErroBusca(null);
        setQuantidade('');
        setObservacao('');
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const podeFazer = (tipo) => {
        if (!permissoes) return false;
        if (permissoes.admin) return true;
        const regras = permissoes.regras || [];
        const acao = tipo === 'ENTRADA' ? 'adicionar' : 'diminuir';
        if (!produtoSelecionado) {
            return regras.some(r => Array.isArray(r.pode) && r.pode.includes(acao));
        }
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

            const label = tipo === 'ENTRADA' ? 'Entrada' : 'Saída';
            const novoSaldo = res.estoqueCA ?? res.estoqueDepois;

            // Mantém produto selecionado, só limpa quantidade e observação
            setProdutoSelecionado(prev => ({ ...prev, estoqueDisponivel: novoSaldo }));
            setQuantidade('');
            setObservacao('');

            toast.success(
                `${label} registrada! ${Number(res.estoqueAntes).toFixed(0)} → ${Number(novoSaldo).toFixed(0)} ${produtoSelecionado.unidade || 'un'}`,
                { duration: 3000 }
            );
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erro ao ajustar estoque.');
        } finally {
            setLoadingAjuste(false);
        }
    };

    const podeEntrada = podeFazer('ENTRADA');
    const podeSaida = podeFazer('SAIDA');

    return (
        <div className="max-w-lg mx-auto px-4 py-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
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

            {/* Campo de busca */}
            <div className="relative mb-4">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    {loadingBusca
                        ? <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
                        : <Search className="h-4 w-4 text-gray-400" />
                    }
                </div>
                <input
                    ref={inputRef}
                    type="text"
                    value={busca}
                    onChange={e => { setBusca(e.target.value); if (produtoSelecionado) setProdutoSelecionado(null); }}
                    placeholder="Nome do produto ou código de barras..."
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    inputMode="search"
                    autoComplete="off"
                />
                {busca && !produtoSelecionado && (
                    <button onClick={limparSelecao} className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600 text-lg font-light">×</button>
                )}
            </div>

            {/* Lista de resultados da busca */}
            {!produtoSelecionado && (
                <>
                    {erroBusca && (
                        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            {erroBusca}
                        </div>
                    )}
                    {!loadingBusca && buscaFeita && produtos.length === 0 && !erroBusca && busca.trim() && (
                        <div className="text-center py-6 text-gray-400 text-sm">
                            Nenhum produto encontrado para <strong className="text-gray-600">"{busca}"</strong>
                        </div>
                    )}
                    {produtos.length > 0 && (
                        <div className="border border-gray-200 rounded-xl overflow-hidden mb-4 shadow-sm">
                            {produtos.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => selecionarProduto(p)}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0"
                                >
                                    <Package className="h-5 w-5 text-gray-400 shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-gray-900 truncate">{p.nome}</p>
                                        <p className="text-xs text-gray-500">{p.codigo || p.ean || '—'} · {p.categoria || 'sem categoria'} · Estoque: {Number(p.estoqueDisponivel || 0).toFixed(0)} {p.unidade}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Produto selecionado */}
            {produtoSelecionado && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="font-semibold text-gray-900 leading-snug">{produtoSelecionado.nome}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {produtoSelecionado.codigo || produtoSelecionado.ean || '—'} · {produtoSelecionado.categoria || 'sem categoria'}
                            </p>
                        </div>
                        <button onClick={limparSelecao} className="text-gray-400 hover:text-gray-600 text-xl font-light shrink-0 leading-none mt-0.5">×</button>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                        <span className="text-sm text-gray-600">Estoque atual:</span>
                        <span className="text-lg font-bold text-blue-700">
                            {Number(produtoSelecionado.estoqueDisponivel || 0).toFixed(0)} {produtoSelecionado.unidade || 'un'}
                        </span>
                    </div>
                </div>
            )}

            {/* Formulário de ajuste */}
            {produtoSelecionado && (
                <div className="space-y-4">
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
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Observação <span className="text-gray-400 font-normal">(opcional)</span></label>
                        <input
                            type="text"
                            value={observacao}
                            onChange={e => setObservacao(e.target.value)}
                            placeholder="Ex: ajuste de inventário, devolução..."
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    {/* Botões + e - */}
                    <div className="grid grid-cols-2 gap-3 pt-1">
                        <button
                            onClick={() => handleAjuste('SAIDA')}
                            disabled={!podeSaida || loadingAjuste}
                            title={!podeSaida ? 'Sem permissão para diminuir estoque nesta categoria' : ''}
                            className={`flex items-center justify-center gap-2 py-4 rounded-xl text-base font-bold transition-all
                                ${podeSaida && !loadingAjuste
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
                            className={`flex items-center justify-center gap-2 py-4 rounded-xl text-base font-bold transition-all
                                ${podeEntrada && !loadingAjuste
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
                            {podeEntrada && podeSaida ? 'Você pode adicionar e diminuir estoque nesta categoria.'
                                : podeEntrada ? 'Você pode apenas adicionar estoque nesta categoria.'
                                    : 'Você pode apenas diminuir estoque nesta categoria.'}
                        </p>
                    )}
                </div>
            )}

            {/* Estado vazio */}
            {!produtoSelecionado && !busca && (
                <div className="text-center py-16 text-gray-400">
                    <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Busque um produto pelo nome ou código de barras para ajustar o estoque.</p>
                </div>
            )}
        </div>
    );
}
