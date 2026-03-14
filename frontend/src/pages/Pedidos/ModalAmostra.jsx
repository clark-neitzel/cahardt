import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Search, Plus, Minus, Loader, Package, Calendar } from 'lucide-react';
import produtoService from '../../services/produtoService';
import amostraService from '../../services/amostraService';
import configService from '../../services/configService';
import toast from 'react-hot-toast';

const ModalAmostra = ({ dados, onClose, onCriada }) => {
    // dados: { leadId?, clienteId?, nomeDestinatario, vendedorId }
    const { leadId, clienteId, nomeDestinatario, vendedorId } = dados;

    const [produtos, setProdutos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [produtoSearch, setProdutoSearch] = useState('');
    const [itensMap, setItensMap] = useState(new Map()); // produtoId → { quantidade, produto }
    const [dataEntrega, setDataEntrega] = useState('');
    const [observacao, setObservacao] = useState('');
    const searchInputRef = useRef(null);

    useEffect(() => {
        carregarProdutos();
    }, []);

    const carregarProdutos = async () => {
        try {
            let cats = [];
            try { cats = await configService.get('categorias_vendas'); } catch (e) { }
            const params = { limit: 1000, ativo: true };
            if (Array.isArray(cats) && cats.length > 0) params.categorias = cats.join(',');

            const data = await produtoService.listar(params);
            const lista = data.data || data || [];
            setProdutos(lista);
        } catch (error) {
            console.error('Erro ao carregar produtos:', error);
            toast.error('Erro ao carregar catálogo de produtos.');
        } finally {
            setLoading(false);
        }
    };

    const produtosFiltrados = useMemo(() => {
        const termo = produtoSearch.toLowerCase().trim();
        if (!termo) return produtos;
        return produtos.filter(p =>
            (p.nome && p.nome.toLowerCase().includes(termo))
            || (p.codigo && p.codigo.toLowerCase().includes(termo))
        );
    }, [produtos, produtoSearch]);

    const setQuantidade = (produtoId, qtd, produto) => {
        setItensMap(prev => {
            const m = new Map(prev);
            if (qtd <= 0) {
                m.delete(produtoId);
            } else {
                m.set(produtoId, { quantidade: qtd, produto });
            }
            return m;
        });
    };

    const itensArray = useMemo(() => Array.from(itensMap.entries()).map(([id, v]) => ({
        produtoId: id,
        quantidade: v.quantidade,
        nomeProduto: `Amostra - ${v.produto.nome}`,
        produto: v.produto,
    })), [itensMap]);

    const handleConfirmar = async () => {
        if (itensArray.length === 0) {
            toast.error('Adicione pelo menos um produto à amostra.');
            return;
        }

        try {
            setSaving(true);
            const amostra = await amostraService.criar({
                leadId: leadId || null,
                clienteId: clienteId || null,
                dataEntrega: dataEntrega || null,
                observacao: observacao || null,
                itens: itensArray.map(i => ({
                    produtoId: i.produtoId,
                    quantidade: i.quantidade,
                    nomeProduto: i.nomeProduto,
                })),
            });
            toast.success('Amostra criada com sucesso!');
            onCriada(amostra.id);
        } catch (error) {
            console.error('Erro ao criar amostra:', error);
            toast.error('Erro ao criar amostra.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end">
            <div className="bg-white w-full rounded-t-2xl max-h-[95vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="font-bold text-[16px] text-gray-900 flex items-center gap-2">
                            <Package className="h-5 w-5 text-orange-500" />
                            Pedido de Amostra
                        </h2>
                        <p className="text-[12px] text-gray-500 mt-0.5 truncate max-w-xs">
                            {nomeDestinatario || 'Sem destinatário'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                    {/* Data de Entrega */}
                    <div>
                        <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">
                            <Calendar className="h-3.5 w-3.5 inline mr-1" />
                            Data de Entrega (opcional)
                        </label>
                        <input
                            type="date"
                            min={new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })}
                            value={dataEntrega}
                            onChange={e => setDataEntrega(e.target.value)}
                            className="block w-full border border-gray-300 rounded-lg p-2.5 bg-white text-gray-900 text-[14px] focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    {/* Observação */}
                    <div>
                        <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Observação (opcional)</label>
                        <textarea
                            value={observacao}
                            onChange={e => setObservacao(e.target.value)}
                            rows={2}
                            placeholder="Ex: Cliente pediu para provar o novo sabor..."
                            className="block w-full border border-gray-300 rounded-lg p-2.5 text-[14px] resize-none bg-white focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    {/* Itens selecionados */}
                    {itensArray.length > 0 && (
                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                            <h3 className="text-[12px] font-bold text-orange-800 uppercase mb-2">
                                Itens da Amostra ({itensArray.length})
                            </h3>
                            <div className="space-y-2">
                                {itensArray.map(item => (
                                    <div key={item.produtoId} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-orange-100">
                                        <div className="flex-1 min-w-0 mr-2">
                                            <p className="text-[13px] font-semibold text-gray-900 truncate">{item.nomeProduto}</p>
                                            <p className="text-[11px] text-gray-500">{item.produto.codigo} · {item.produto.unidade}</p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                onClick={() => setQuantidade(item.produtoId, item.quantidade - 1, item.produto)}
                                                className="w-7 h-7 flex items-center justify-center rounded-full bg-red-100 text-red-600 active:bg-red-200"
                                            >
                                                <Minus className="h-3.5 w-3.5" />
                                            </button>
                                            <input
                                                type="number" min="1"
                                                className="w-10 text-center border border-gray-300 rounded bg-white text-gray-900 text-sm font-bold py-0.5"
                                                value={item.quantidade}
                                                onFocus={e => e.target.select()}
                                                onChange={e => {
                                                    const v = Number(e.target.value);
                                                    if (v >= 0) setQuantidade(item.produtoId, v, item.produto);
                                                }}
                                            />
                                            <button
                                                onClick={() => setQuantidade(item.produtoId, item.quantidade + 1, item.produto)}
                                                className="w-7 h-7 flex items-center justify-center rounded-full bg-orange-500 text-white active:bg-orange-600"
                                            >
                                                <Plus className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Busca de produtos */}
                    <div>
                        <label className="block text-[13px] font-bold text-gray-700 mb-1.5">Adicionar Produtos</label>
                        <div className="flex items-center bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 gap-2 shadow-sm mb-2">
                            <Search className="h-4 w-4 text-gray-400 shrink-0" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                className="flex-1 text-sm text-gray-900 bg-transparent outline-none placeholder-gray-400"
                                placeholder="Buscar produto por nome ou código..."
                                value={produtoSearch}
                                onChange={e => setProdutoSearch(e.target.value)}
                            />
                            {produtoSearch && (
                                <button onClick={() => setProdutoSearch('')} className="text-gray-400">
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>

                        {loading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader className="h-6 w-6 animate-spin text-gray-400" />
                            </div>
                        ) : (
                            <div className="space-y-1 max-h-[35vh] overflow-y-auto">
                                {produtosFiltrados.slice(0, 50).map(produto => {
                                    const qtd = itensMap.get(produto.id)?.quantidade || 0;
                                    return (
                                        <div key={produto.id} className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-colors ${qtd > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-100 hover:bg-gray-50'}`}>
                                            <div className="flex-1 min-w-0 mr-2">
                                                <p className="text-[13px] font-medium text-gray-900 truncate">{produto.nome}</p>
                                                <p className="text-[11px] text-gray-500">{produto.codigo} · {produto.unidade}</p>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                {qtd > 0 && (
                                                    <button
                                                        onClick={() => setQuantidade(produto.id, qtd - 1, produto)}
                                                        className="w-7 h-7 flex items-center justify-center rounded-full bg-red-100 text-red-600 active:bg-red-200"
                                                    >
                                                        <Minus className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                                {qtd > 0 && (
                                                    <input
                                                        type="number" min="1"
                                                        className="w-10 text-center border border-gray-300 rounded bg-white text-gray-900 text-sm font-bold py-0.5"
                                                        value={qtd}
                                                        onFocus={e => e.target.select()}
                                                        onChange={e => {
                                                            const v = Number(e.target.value);
                                                            if (v >= 0) setQuantidade(produto.id, v, produto);
                                                        }}
                                                    />
                                                )}
                                                <button
                                                    onClick={() => setQuantidade(produto.id, qtd + 1, produto)}
                                                    className="w-7 h-7 flex items-center justify-center rounded-full bg-orange-500 text-white active:bg-orange-600 shadow-sm"
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                                {produtosFiltrados.length === 0 && (
                                    <p className="text-center text-sm text-gray-400 py-4">Nenhum produto encontrado.</p>
                                )}
                                {produtosFiltrados.length > 50 && (
                                    <p className="text-center text-[11px] text-gray-400 py-2">Mostrando 50 de {produtosFiltrados.length}. Refine a busca.</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-gray-100 bg-white sticky bottom-0">
                    <button
                        onClick={handleConfirmar}
                        disabled={saving || itensArray.length === 0}
                        className="w-full bg-orange-500 text-white font-bold py-3.5 rounded-xl text-[15px] flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {saving ? <Loader className="h-5 w-5 animate-spin" /> : <Package className="h-5 w-5" />}
                        {saving ? 'Criando Amostra...' : `Confirmar Amostra (${itensArray.length} ${itensArray.length === 1 ? 'item' : 'itens'})`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ModalAmostra;
