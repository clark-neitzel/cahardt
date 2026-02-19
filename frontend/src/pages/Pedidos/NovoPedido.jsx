import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Save, User, ShoppingCart, DollarSign, Plus, Trash2, AlertCircle } from 'lucide-react';
import clienteService from '../../services/clienteService';
import produtoService from '../../services/produtoService';
import tabelaPrecoService from '../../services/tabelaPrecoService';
import pedidoService from '../../services/pedidoService';

const NovoPedido = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Core Data
    const [clientes, setClientes] = useState([]);
    const [produtos, setProdutos] = useState([]);
    const [todasCondicoes, setTodasCondicoes] = useState([]);

    // Form State
    const [clienteId, setClienteId] = useState('');
    const [vendedorId, setVendedorId] = useState(null); // Extracted from selected client
    const [condicaoPagamentoId, setCondicaoPagamentoId] = useState('');
    const [observacoes, setObservacoes] = useState('');
    const [itens, setItens] = useState([]); // { produtoId, quantidade, valorUnitario, valorBase, flexUnitario }

    // Computed/Derived
    const [condicoesPermitidas, setCondicoesPermitidas] = useState([]);
    const [clienteSelecionado, setClienteSelecionado] = useState(null);
    const [condicaoSelecionada, setCondicaoSelecionada] = useState(null);

    // Flex Total
    const [flexTotal, setFlexTotal] = useState(0);

    useEffect(() => {
        carregarDadosBase();
    }, []);

    const carregarDadosBase = async () => {
        try {
            const [clientesData, produtosData, condicoesData] = await Promise.all([
                clienteService.listar({ limit: 1000 }), // TODO: Implement better search for scale
                produtoService.listar({ limit: 1000 }),
                tabelaPrecoService.listar()
            ]);

            // For now, load active items
            setClientes(clientesData.data?.filter(c => c.Ativo) || clientesData?.filter(c => c.Ativo) || []);
            setProdutos(produtosData.data?.filter(p => p.ativo) || produtosData?.filter(p => p.ativo) || []);
            setTodasCondicoes(condicoesData);

        } catch (error) {
            console.error("Erro ao carregar dados", error);
            alert("Erro ao carregar dados básicos para o pedido.");
        } finally {
            setLoading(false);
        }
    };

    // When client changes
    useEffect(() => {
        if (!clienteId) {
            setClienteSelecionado(null);
            setVendedorId(null);
            setCondicoesPermitidas([]);
            setCondicaoPagamentoId('');
            return;
        }

        const cliente = clientes.find(c => c.UUID === clienteId);
        if (cliente) {
            if (!cliente.idVendedor) {
                alert("Este cliente não tem um vendedor associado! Não é possível criar pedido.");
                setClienteId('');
                return;
            }

            setClienteSelecionado(cliente);
            setVendedorId(cliente.idVendedor);

            // Build permitted conditions
            if (cliente.condicoes_pagamento_permitidas && cliente.condicoes_pagamento_permitidas.length > 0) {
                const permitidas = todasCondicoes.filter(c => cliente.condicoes_pagamento_permitidas.includes(c.idCondicao));
                setCondicoesPermitidas(permitidas);
                if (permitidas.length > 0) {
                    setCondicaoPagamentoId(permitidas[0].idCondicao);
                }
            } else if (cliente.Condicao_de_pagamento) {
                const padrao = todasCondicoes.find(c => c.idCondicao === cliente.Condicao_de_pagamento);
                setCondicoesPermitidas(padrao ? [padrao] : todasCondicoes);
                setCondicaoPagamentoId(cliente.Condicao_de_pagamento);
            } else {
                setCondicoesPermitidas(todasCondicoes);
            }
        }
    }, [clienteId, clientes, todasCondicoes]);

    // When condition changes, recalculate Flex
    useEffect(() => {
        const cond = todasCondicoes.find(c => c.idCondicao === condicaoPagamentoId);
        setCondicaoSelecionada(cond || null);
        recalcularItens(cond);
    }, [condicaoPagamentoId]);

    const recalcularItens = (condicao) => {
        if (!condicao) return;
        const acrescimo = Number(condicao.acrescimoPreco) || 0;

        const novosItens = itens.map(item => {
            const produto = produtos.find(p => p.id === item.produtoId);
            if (!produto) return item;

            const precoTabela = Number(produto.valorVenda) || 0;
            const valorBase = precoTabela * (1 + (acrescimo / 100));
            const flexUnitario = item.valorUnitario - valorBase;

            return {
                ...item,
                valorBase: valorBase,
                flexUnitario: flexUnitario
            };
        });

        setItens(novosItens);
        calcularFlexTotal(novosItens);
    };

    const calcularFlexTotal = (listaItens) => {
        const total = listaItens.reduce((acc, item) => {
            return acc + (item.flexUnitario * item.quantidade);
        }, 0);
        setFlexTotal(total);
    };

    const adicionarProduto = () => {
        setItens([
            ...itens,
            { id: Date.now().toString(), produtoId: '', quantidade: 1, valorUnitario: 0, valorBase: 0, flexUnitario: 0 }
        ]);
    };

    const removerProduto = (idToRemove) => {
        const novos = itens.filter(i => i.id !== idToRemove);
        setItens(novos);
        calcularFlexTotal(novos);
    };

    const atualizarItem = async (idToUpdate, field, value) => {
        let novosItens = [...itens];
        const idx = novosItens.findIndex(i => i.id === idToUpdate);
        if (idx === -1) return;

        let item = { ...novosItens[idx], [field]: value };

        // Se mudou o produto, buscar preço base e último preço
        if (field === 'produtoId' && value) {
            const produto = produtos.find(p => p.id === value);
            if (produto) {
                const acrescimo = condicaoSelecionada ? Number(condicaoSelecionada.acrescimoPreco) : 0;
                const precoTabela = Number(produto.valorVenda) || 0;
                const valorBase = precoTabela * (1 + (acrescimo / 100));

                let valorPraticado = valorBase;

                // Tentar buscar último preço
                if (clienteId) {
                    try {
                        const ultimo = await pedidoService.obterUltimoPreco(clienteId, value);
                        if (ultimo && ultimo.valor) {
                            valorPraticado = Number(ultimo.valor);
                        }
                    } catch (e) {
                        // ignore
                    }
                }

                item.valorBase = valorBase;
                item.valorUnitario = valorPraticado;
                item.flexUnitario = valorPraticado - valorBase;
            }
        }

        // Se mudou quantidade ou valor unitário, recalcular flex item
        if (field === 'quantidade' || field === 'valorUnitario') {
            const numVal = Number(value) || 0;
            if (field === 'valorUnitario') {
                item.flexUnitario = numVal - item.valorBase;
            }
        }

        novosItens[idx] = item;
        setItens(novosItens);
        calcularFlexTotal(novosItens);
    };

    const handleSalvar = (statusEnvio) => {
        if (!clienteId || itens.length === 0) {
            alert("Preencha cliente e adicione itens.");
            return;
        }

        setSaving(true);
        if (navigator.geolocation && statusEnvio === 'ENVIAR') {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const latLng = `${position.coords.latitude},${position.coords.longitude}`;
                    salvarPedido(statusEnvio, latLng);
                },
                (error) => {
                    console.warn("GPS falhou, enviando sem GPS", error);
                    salvarPedido(statusEnvio, null);
                },
                { enableHighAccuracy: true, timeout: 5000 }
            );
        } else {
            salvarPedido(statusEnvio, null);
        }
    };

    const salvarPedido = async (statusEnvio, latLng) => {
        const payload = {
            clienteId,
            vendedorId,
            dataVenda: new Date().toISOString(),
            observacoes,
            tipoPagamento: condicaoSelecionada?.tipoPagamento,
            opcaoCondicaoPagamento: condicaoSelecionada?.opcaoCondicao,
            qtdParcelas: condicaoSelecionada?.qtdParcelas || 1,
            primeiroVencimento: null, // Pode ser calculado no backend ou aqui se necessário
            intervaloDias: condicaoSelecionada?.parcelasDias || 0,
            idCategoria: null, // Preencher se usar categorias no Conta Azul
            latLng,
            statusEnvio,
            itens: itens.map(i => ({
                produtoId: i.produtoId,
                quantidade: i.quantidade,
                valor: i.valorUnitario,
                valorBase: i.valorBase
            }))
        };

        try {
            await pedidoService.criar(payload);
            alert("Pedido salvo com sucesso!");
            navigate('/pedidos');
        } catch (error) {
            const msg = error.response?.data?.error || "Erro ao salvar pedido.";
            alert(msg);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-4 text-center">Carregando...</div>;

    const vTotal = itens.reduce((acc, i) => acc + ((Number(i.valorUnitario) || 0) * (Number(i.quantidade) || 0)), 0);

    return (
        <div className="bg-gray-50 min-h-screen pb-24">
            {/* Mobile Header Fixed */}
            <div className="bg-white shadow-sm sticky top-0 z-10">
                <div className="flex items-center justify-between p-4">
                    <div className="flex items-center">
                        <button onClick={() => navigate(-1)} className="mr-3 text-gray-600">
                            <ArrowLeft className="h-6 w-6" />
                        </button>
                        <h1 className="text-xl font-bold text-gray-900">Novo Pedido</h1>
                    </div>
                </div>
                {/* Flex Total Resumo Fixed */}
                <div className={`px-4 py-2 flex justify-between items-center text-sm font-bold text-white shadow-inner ${flexTotal >= 0 ? 'bg-green-600' : 'bg-red-600'}`}>
                    <span>Saldo Flex do Pedido:</span>
                    <span>{flexTotal > 0 && '+'}{flexTotal.toFixed(2).replace('.', ',')}</span>
                </div>
            </div>

            <div className="p-4 space-y-4 max-w-lg mx-auto">
                {/* Cliente */}
                <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                        <User className="h-4 w-4 mr-1" /> Cliente
                    </label>
                    <select
                        className="w-full border-gray-300 rounded-md shadow-sm p-3 bg-gray-50 text-base focus:ring-primary focus:border-primary"
                        value={clienteId}
                        onChange={e => setClienteId(e.target.value)}
                    >
                        <option value="">Selecione o Cliente</option>
                        {clientes.map(c => (
                            <option key={c.UUID} value={c.UUID}>{c.NomeFantasia || c.Nome}</option>
                        ))}
                    </select>
                </div>

                {/* Condição de Pagamento */}
                {clienteId && (
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                        <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                            <DollarSign className="h-4 w-4 mr-1" /> Condição de Pagamento
                        </label>
                        <select
                            className="w-full border-gray-300 rounded-md shadow-sm p-3 bg-gray-50 text-base focus:ring-primary focus:border-primary"
                            value={condicaoPagamentoId}
                            onChange={e => setCondicaoPagamentoId(e.target.value)}
                        >
                            <option value="">Selecione...</option>
                            {condicoesPermitidas.map(c => (
                                <option key={c.idCondicao} value={c.idCondicao}>{c.nomeCondicao}</option>
                            ))}
                        </select>
                        {condicaoSelecionada && (
                            <div className="mt-2 text-xs text-gray-500 flex justify-between">
                                <span>Acréscimo: {condicaoSelecionada.acrescimoPreco}%</span>
                                <span>{condicaoSelecionada.qtdParcelas}x de {condicaoSelecionada.parcelasDias} dias</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Itens do Pedido */}
                {clienteId && condicaoPagamentoId && (
                    <div className="bg-white p-2 rounded-lg shadow-sm border border-gray-200">
                        <div className="p-2 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-lg">
                            <label className="text-sm font-bold text-gray-800 flex items-center">
                                <ShoppingCart className="h-4 w-4 mr-1" /> Produtos
                            </label>
                            <button
                                onClick={adicionarProduto}
                                className="bg-primary text-white p-2 rounded-full hover:bg-blue-700 shadow-sm"
                            >
                                <Plus className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="space-y-3 p-2">
                            {itens.length === 0 ? (
                                <p className="text-center text-sm text-gray-500 py-4">Nenhum produto adicionado.</p>
                            ) : (
                                itens.map((item, index) => (
                                    <div key={item.id} className="relative p-3 border border-gray-200 rounded-md bg-white shadow-sm">

                                        <div className="pr-8 mb-3">
                                            <select
                                                className="w-full border-none bg-gray-50 rounded p-2 text-sm font-medium focus:ring-0"
                                                value={item.produtoId}
                                                onChange={e => atualizarItem(item.id, 'produtoId', e.target.value)}
                                            >
                                                <option value="">Buscar produto...</option>
                                                {produtos.map(p => (
                                                    <option key={p.id} value={p.id}>{p.nome}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <button
                                            onClick={() => removerProduto(item.id)}
                                            className="absolute top-2 right-2 text-gray-400 hover:text-red-500 p-2"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>

                                        {item.produtoId && (
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-xs text-gray-500 mb-1">Qtd</label>
                                                    <input
                                                        type="number"
                                                        min="0.1" step="0.1"
                                                        className="w-full border-gray-300 rounded p-2 text-center text-sm"
                                                        value={item.quantidade}
                                                        onChange={e => atualizarItem(item.id, 'quantidade', e.target.value)}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-500 mb-1">R$ Un (Praticado)</label>
                                                    <input
                                                        type="number"
                                                        min="0.01" step="0.01"
                                                        className="w-full border-gray-300 rounded p-2 text-center text-sm font-bold text-gray-800"
                                                        value={item.valorUnitario}
                                                        onChange={e => atualizarItem(item.id, 'valorUnitario', e.target.value)}
                                                    />
                                                    <div className="text-xs mt-1 text-center">
                                                        <span className="text-gray-400">Base: {item.valorBase.toFixed(2)}</span>
                                                        <span className={`ml-2 font-semibold ${item.flexUnitario >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                            {item.flexUnitario >= 0 ? '+' : ''}{item.flexUnitario.toFixed(2)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* Observações */}
                <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Observações do Pedido</label>
                    <textarea
                        className="w-full border-gray-300 rounded-md shadow-sm p-3 text-sm focus:ring-primary focus:border-primary"
                        rows="3"
                        placeholder="Ex: Entregar na porta dos fundos."
                        value={observacoes}
                        onChange={e => setObservacoes(e.target.value)}
                    ></textarea>
                </div>

                <div className="pb-8 text-center text-gray-500 text-sm flex items-center justify-center">
                    <MapPin className="h-4 w-4 mr-1" />
                    Localização será capturada ao Enviar
                </div>

            </div>

            {/* Bottom Fixed Action Bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-20">
                <div className="max-w-lg mx-auto">
                    <div className="flex justify-between items-end mb-3">
                        <span className="text-gray-600 text-sm font-medium">Total Pedido:</span>
                        <span className="text-2xl font-bold text-gray-900">R$ {vTotal.toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div className="flex gap-3">
                        <button
                            disabled={saving}
                            onClick={() => handleSalvar('ABERTO')}
                            className="flex-1 bg-gray-100 text-gray-700 font-semibold py-3 px-4 rounded-lg active:bg-gray-200"
                        >
                            Salvar Rascunho
                        </button>
                        <button
                            disabled={saving}
                            onClick={() => handleSalvar('ENVIAR')}
                            className="flex-1 bg-primary text-white font-semibold py-3 px-4 rounded-lg active:bg-blue-700 flex justify-center items-center shadow-md bg-gradient-to-r from-blue-600 to-blue-500"
                        >
                            <Save className="h-5 w-5 mr-2" />
                            Finalizar e Enviar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NovoPedido;
