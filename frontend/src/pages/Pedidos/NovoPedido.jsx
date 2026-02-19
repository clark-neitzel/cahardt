import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Save, User, ShoppingCart, DollarSign, Plus, Trash2, AlertCircle, X } from 'lucide-react';
import clienteService from '../../services/clienteService';
import produtoService from '../../services/produtoService';
import tabelaPrecoService from '../../services/tabelaPrecoService';
import pedidoService from '../../services/pedidoService';
import configService from '../../services/configService';

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

    // Client Search State
    const [clienteSearchText, setClienteSearchText] = useState('');
    const [showClienteDropdown, setShowClienteDropdown] = useState(false);

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
            // Apply restrictions to show only catalog products
            let cats = [];
            try {
                cats = await configService.get('categorias_vendas');
            } catch (e) {
                console.warn('Categorias nao encontradas', e);
            }

            const paramsProd = { limit: 1000, ativo: true };
            if (Array.isArray(cats) && cats.length > 0) {
                paramsProd.categorias = cats.join(',');
            }

            const [clientesData, produtosData, condicoesData] = await Promise.all([
                clienteService.listar({ limit: 2000 }),
                produtoService.listar(paramsProd),
                tabelaPrecoService.listar()
            ]);

            // For now, load active items
            setClientes(clientesData.data?.filter(c => c.Ativo) || clientesData?.filter(c => c.Ativo) || []);
            setProdutos(produtosData.data || produtosData || []);
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
                setClienteSearchText('');
                return;
            }

            setClienteSelecionado(cliente);
            setVendedorId(cliente.idVendedor);
            setClienteSearchText(cliente.NomeFantasia || cliente.Nome);

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
            { id: Date.now().toString(), produtoId: '', quantidade: 1, valorUnitario: 0, valorBase: 0, flexUnitario: 0 },
            ...itens
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
                item.quantidade = 1; // reset qty
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

        // Validação de itens não preenchidos
        if (itens.some(i => !i.produtoId || isNaN(i.valorUnitario) || i.quantidade <= 0)) {
            alert("Todos os itens adicionados devem ter um produto selecionado, valor e quantidade.");
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
            primeiroVencimento: null,
            intervaloDias: condicaoSelecionada?.parcelasDias || 0,
            idCategoria: null,
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
        <div className="bg-gray-50 min-h-screen pb-32">
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
                {/* Cliente (Busca Customizada) */}
                <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                        <User className="h-4 w-4 mr-1" /> Cliente
                    </label>

                    <div className="relative">
                        <div className="flex items-center">
                            <input
                                type="text"
                                className="w-full border border-gray-300 rounded-md shadow-sm p-3 bg-white text-gray-900 focus:ring-primary focus:border-primary pr-10"
                                placeholder="Buscar Cliente (Nome, Razão, CNPJ)..."
                                value={clienteSearchText}
                                onChange={(e) => {
                                    setClienteSearchText(e.target.value);
                                    setShowClienteDropdown(true);
                                    if (e.target.value === '') {
                                        setClienteId('');
                                    }
                                }}
                                onFocus={() => setShowClienteDropdown(true)}
                                // Pequeno delay pra permitir clique na lista antes dela fechar
                                onBlur={() => setTimeout(() => setShowClienteDropdown(false), 200)}
                            />
                            {clienteId && (
                                <button
                                    className="absolute right-3 text-gray-400 hover:text-red-500"
                                    onClick={() => {
                                        setClienteId('');
                                        setClienteSearchText('');
                                    }}
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            )}
                        </div>

                        {showClienteDropdown && !clienteId && clienteSearchText && (
                            <ul className="absolute z-30 mt-1 w-full bg-white border border-gray-200 shadow-xl max-h-60 rounded-md py-1 text-base ring-0 overflow-auto sm:text-sm">
                                {clientes
                                    .filter(c => (c.NomeFantasia || c.Nome).toLowerCase().includes(clienteSearchText.toLowerCase()) || (c.Documento || '').includes(clienteSearchText))
                                    .slice(0, 30) // Limitamos a view inicial pra não quebrar a performance 
                                    .map(c => (
                                        <li
                                            key={c.UUID}
                                            className="text-gray-900 cursor-pointer select-none relative py-2 pl-3 pr-4 hover:bg-gray-100 border-b border-gray-50 last:border-0"
                                            onClick={() => {
                                                setClienteId(c.UUID);
                                            }}
                                        >
                                            <span className="font-semibold block truncate leading-tight dark:text-gray-900">{c.NomeFantasia || c.Nome}</span>
                                            <span className="text-gray-500 text-xs block truncate">{c.Documento || 'Sem Documento'}</span>
                                        </li>
                                    ))
                                }
                                {clientes.filter(c => (c.NomeFantasia || c.Nome).toLowerCase().includes(clienteSearchText.toLowerCase()) || (c.Documento || '').includes(clienteSearchText)).length === 0 && (
                                    <li className="text-gray-500 select-none relative py-3 px-3 text-center text-sm">Nenhum cliente encontrado.</li>
                                )}
                            </ul>
                        )}
                        {!clienteId && !clienteSearchText && showClienteDropdown && (
                            <ul className="absolute z-30 mt-1 w-full bg-white border border-gray-200 shadow-xl max-h-60 rounded-md py-1 text-base ring-0 overflow-auto sm:text-sm">
                                <li className="text-gray-500 select-none relative py-3 px-3 text-center text-sm">Digite para buscar...</li>
                            </ul>
                        )}
                    </div>
                </div>

                {/* Condição de Pagamento */}
                {clienteId && (
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200  animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                            <DollarSign className="h-4 w-4 mr-1" /> Condição de Pagamento
                        </label>
                        <select
                            className="w-full border border-gray-300 rounded-md shadow-sm p-3 bg-white text-gray-900 text-base focus:ring-primary focus:border-primary"
                            value={condicaoPagamentoId}
                            onChange={e => setCondicaoPagamentoId(e.target.value)}
                        >
                            <option value="">Selecione...</option>
                            {condicoesPermitidas.map(c => (
                                <option key={c.idCondicao} value={c.idCondicao}>{c.nomeCondicao}</option>
                            ))}
                        </select>
                        {condicaoSelecionada && (
                            <div className="mt-2 text-xs text-gray-500 flex justify-between bg-blue-50 p-2 rounded">
                                <span><strong className="text-blue-800">Acréscimo:</strong> {condicaoSelecionada.acrescimoPreco}%</span>
                                <span><strong className="text-blue-800">Parcelas:</strong> {condicaoSelecionada.qtdParcelas}x de {condicaoSelecionada.parcelasDias} dias</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Itens do Pedido */}
                {clienteId && condicaoPagamentoId && (
                    <div className="bg-white p-2 rounded-lg shadow-sm border border-gray-200 animate-in fade-in slide-in-from-bottom-4 duration-500">
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

                        <div className="space-y-3 p-2 bg-gray-100/50">
                            {itens.length === 0 ? (
                                <div className="text-center py-6 px-4">
                                    <ShoppingCart className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                                    <p className="text-sm text-gray-500">Adicione produtos ao pedido através do botão acima.</p>
                                </div>
                            ) : (
                                itens.map((item, index) => (
                                    <div key={item.id} className="relative p-3 border border-gray-200 rounded-md bg-white shadow-sm transition-all">

                                        <div className="pr-8 mb-3">
                                            <select
                                                className="w-full border border-gray-300 bg-white text-gray-900 rounded p-2 text-sm font-medium focus:ring-primary"
                                                value={item.produtoId}
                                                onChange={e => atualizarItem(item.id, 'produtoId', e.target.value)}
                                            >
                                                <option value="">Selecione o produto...</option>
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
                                            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-100">
                                                <div>
                                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Quantidade</label>
                                                    <input
                                                        type="number"
                                                        min="0.1" step="0.1"
                                                        className="w-full border border-gray-300 bg-white text-gray-900 rounded p-2 text-center text-base"
                                                        value={item.quantidade}
                                                        onChange={e => atualizarItem(item.id, 'quantidade', e.target.value)}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-semibold text-gray-600 mb-1">R$ Un (Praticado)</label>
                                                    <input
                                                        type="number"
                                                        min="0.01" step="0.01"
                                                        className="w-full border border-gray-300 bg-white text-gray-900 rounded p-2 text-center text-base font-bold"
                                                        value={item.valorUnitario}
                                                        onChange={e => atualizarItem(item.id, 'valorUnitario', e.target.value)}
                                                    />
                                                    <div className="text-xs mt-1 text-center bg-gray-50 p-1 rounded border border-gray-100">
                                                        <span className="text-gray-500 block mb-0.5">Tabela c/ Acr.: <b>{item.valorBase.toFixed(2)}</b></span>
                                                        <span className={`font-bold inline-block px-2 py-0.5 rounded-full ${item.flexUnitario >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                            {item.flexUnitario >= 0 ? '+' : ''}{item.flexUnitario.toFixed(2)} unit
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
                        className="w-full border border-gray-300 rounded-md shadow-sm p-3 text-sm focus:ring-primary focus:border-primary bg-white text-gray-900"
                        rows="3"
                        placeholder="Ex: Entregar na doca dos fundos até as 17:00hs."
                        value={observacoes}
                        onChange={e => setObservacoes(e.target.value)}
                    ></textarea>
                </div>

                <div className="pt-2 text-center text-gray-500 text-xs flex items-center justify-center font-medium">
                    <MapPin className="h-3 w-3 mr-1" />
                    Localização capturada e enviada como registro do vendedor.
                </div>

            </div>

            {/* Bottom Fixed Action Bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.1)] z-20">
                <div className="max-w-lg mx-auto">
                    <div className="flex justify-between items-center mb-3">
                        <span className="text-gray-600 text-sm font-medium">Soma dos Itens:</span>
                        <span className="text-2xl font-extrabold text-gray-900">R$ {vTotal.toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div className="flex gap-3">
                        <button
                            disabled={saving}
                            onClick={() => handleSalvar('ABERTO')}
                            className="flex-1 bg-white border border-gray-300 text-gray-700 font-semibold py-3 px-2 rounded-lg active:bg-gray-100 shadow-sm transition outline-none"
                        >
                            Salvar Rascunho
                        </button>
                        <button
                            disabled={saving}
                            onClick={() => handleSalvar('ENVIAR')}
                            className="flex-1 bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold py-3 px-2 rounded-lg active:from-blue-700 active:to-blue-600 shadow-md transition flex justify-center items-center outline-none ring-2 ring-blue-500 ring-offset-2"
                        >
                            <Save className="h-5 w-5 mr-2" />
                            Finalizar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NovoPedido;
