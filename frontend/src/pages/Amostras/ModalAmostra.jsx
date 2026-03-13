import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, Plus, Minus, Loader, Package } from 'lucide-react';
import produtoService from '../../services/produtoService';
import amostraService from '../../services/amostraService';
import toast from 'react-hot-toast';

const ModalAmostra = ({ isOpen, onClose, leadId, clienteId, onCriada }) => {
    const [busca, setBusca] = useState('');
    const [produtos, setProdutos] = useState([]);
    const [buscando, setBuscando] = useState(false);
    const [itens, setItens] = useState([]); // { produtoId, nome, unidade, quantidade }
    const [observacao, setObservacao] = useState('');
    const [salvando, setSalvando] = useState(false);

    const buscarProdutos = useCallback(async (termo) => {
        if (!termo || termo.length < 2) { setProdutos([]); return; }
        try {
            setBuscando(true);
            const data = await produtoService.listar({ search: termo, limit: 20, ativo: true });
            const lista = Array.isArray(data) ? data : (data.produtos || []);
            setProdutos(lista);
        } catch {
            setProdutos([]);
        } finally {
            setBuscando(false);
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => buscarProdutos(busca), 300);
        return () => clearTimeout(timer);
    }, [busca, buscarProdutos]);

    const adicionarItem = (produto) => {
        if (itens.find(i => i.produtoId === produto.id)) {
            toast.error('Produto já adicionado.');
            return;
        }
        setItens(prev => [...prev, {
            produtoId: produto.id,
            nome: produto.nome,
            unidade: produto.unidade || 'UN',
            quantidade: 1
        }]);
        setBusca('');
        setProdutos([]);
    };

    const removerItem = (produtoId) => {
        setItens(prev => prev.filter(i => i.produtoId !== produtoId));
    };

    const alterarQuantidade = (produtoId, delta) => {
        setItens(prev => prev.map(i => {
            if (i.produtoId !== produtoId) return i;
            const novaQtd = Math.max(0.1, parseFloat(i.quantidade) + delta);
            return { ...i, quantidade: Math.round(novaQtd * 100) / 100 };
        }));
    };

    const setQuantidade = (produtoId, valor) => {
        setItens(prev => prev.map(i => {
            if (i.produtoId !== produtoId) return i;
            return { ...i, quantidade: valor };
        }));
    };

    const handleSalvar = async () => {
        if (itens.length === 0) {
            toast.error('Adicione pelo menos 1 produto.');
            return;
        }
        const itensInvalidos = itens.some(i => !i.quantidade || parseFloat(i.quantidade) <= 0);
        if (itensInvalidos) {
            toast.error('Verifique as quantidades.');
            return;
        }

        try {
            setSalvando(true);
            const amostra = await amostraService.criar({
                leadId: leadId || null,
                clienteId: clienteId || null,
                observacao: observacao || null,
                itens: itens.map(i => ({
                    produtoId: i.produtoId,
                    quantidade: parseFloat(i.quantidade)
                }))
            });
            toast.success(`Amostra #${amostra.numero} criada!`);
            if (onCriada) onCriada(amostra);
            handleFechar();
        } catch {
            toast.error('Erro ao criar amostra.');
        } finally {
            setSalvando(false);
        }
    };

    const handleFechar = () => {
        setItens([]);
        setBusca('');
        setProdutos([]);
        setObservacao('');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <div>
                        <h3 className="font-bold text-[16px] text-gray-900 flex items-center gap-2">
                            <Package className="h-5 w-5 text-orange-500" />
                            Nova Amostra
                        </h3>
                        <p className="text-[12px] text-gray-500 mt-0.5">Selecione produtos e quantidades</p>
                    </div>
                    <button onClick={handleFechar} className="p-1.5 text-gray-400 hover:text-gray-600">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {/* Busca de Produtos */}
                    <div className="relative">
                        <div className="flex items-center border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50 focus-within:border-orange-300 focus-within:bg-white transition-colors">
                            <Search className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                            <input
                                type="text"
                                value={busca}
                                onChange={e => setBusca(e.target.value)}
                                placeholder="Buscar produto por nome ou código..."
                                className="flex-1 bg-transparent text-[14px] outline-none text-gray-900 placeholder-gray-400"
                            />
                            {buscando && <Loader className="h-4 w-4 animate-spin text-gray-400" />}
                        </div>

                        {/* Resultados da busca */}
                        {produtos.length > 0 && (
                            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                {produtos.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => adicionarItem(p)}
                                        className="w-full text-left px-4 py-2.5 hover:bg-orange-50 text-[13px] text-gray-800 border-b border-gray-50 last:border-0 flex items-center justify-between"
                                    >
                                        <span className="truncate">{p.nome}</span>
                                        <span className="text-[11px] text-gray-400 ml-2 flex-shrink-0">{p.unidade || 'UN'}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Itens adicionados */}
                    {itens.length > 0 ? (
                        <div className="space-y-2">
                            <p className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider">
                                {itens.length} {itens.length === 1 ? 'produto' : 'produtos'}
                            </p>
                            {itens.map(item => (
                                <div key={item.produtoId} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-medium text-gray-900 truncate">{item.nome}</p>
                                        <p className="text-[11px] text-gray-400">{item.unidade}</p>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={() => alterarQuantidade(item.produtoId, -1)}
                                            className="p-1 rounded-lg bg-white border border-gray-200 text-gray-500 hover:bg-gray-100"
                                        >
                                            <Minus className="h-3.5 w-3.5" />
                                        </button>
                                        <input
                                            type="number"
                                            value={item.quantidade}
                                            onChange={e => setQuantidade(item.produtoId, e.target.value)}
                                            onBlur={e => {
                                                const v = parseFloat(e.target.value);
                                                if (!v || v <= 0) setQuantidade(item.produtoId, 1);
                                            }}
                                            className="w-16 text-center text-[14px] font-semibold border border-gray-200 rounded-lg py-1 bg-white"
                                            min="0.1"
                                            step="1"
                                        />
                                        <button
                                            onClick={() => alterarQuantidade(item.produtoId, 1)}
                                            className="p-1 rounded-lg bg-white border border-gray-200 text-gray-500 hover:bg-gray-100"
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => removerItem(item.produtoId)}
                                        className="p-1 text-gray-400 hover:text-red-500"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-6 text-gray-400">
                            <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
                            <p className="text-[13px]">Busque e adicione produtos acima</p>
                        </div>
                    )}

                    {/* Observação */}
                    <div>
                        <label className="block text-[12px] font-semibold text-gray-600 mb-1">Observação (opcional)</label>
                        <textarea
                            value={observacao}
                            onChange={e => setObservacao(e.target.value)}
                            rows={2}
                            className="w-full border border-gray-200 rounded-xl p-3 text-[14px] text-gray-900 resize-none focus:border-orange-300 outline-none"
                            placeholder="Ex: Entregar junto com pedido #123..."
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-gray-100 flex gap-2">
                    <button
                        onClick={handleFechar}
                        className="flex-1 py-2.5 border border-gray-300 rounded-xl text-[14px] font-semibold text-gray-600"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSalvar}
                        disabled={itens.length === 0 || salvando}
                        className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-[14px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {salvando && <Loader className="h-4 w-4 animate-spin" />}
                        Criar Amostra
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ModalAmostra;
