import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Save, User, ShoppingCart, DollarSign, Plus, Trash2, Calendar, FileText, AlertCircle, X, CheckCircle, ChevronDown } from 'lucide-react';
import clienteService from '../../services/clienteService';
import produtoService from '../../services/produtoService';
import tabelaPrecoService from '../../services/tabelaPrecoService';
import pedidoService from '../../services/pedidoService';
import configService from '../../services/configService';

const DIA_SEMANA_MAP = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

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
    const [vendedorId, setVendedorId] = useState(null);
    const [condicaoPagamentoId, setCondicaoPagamentoId] = useState('');
    const [dataEntrega, setDataEntrega] = useState(new Date().toISOString().split('T')[0]); // YYYY-MM-DD
    const [isEncaixe, setIsEncaixe] = useState(false);
    const [observacoes, setObservacoes] = useState('');
    const [itens, setItens] = useState([]);

    // Client/Product Search State
    const [clienteSearchText, setClienteSearchText] = useState('');
    const [showClienteDropdown, setShowClienteDropdown] = useState(false);
    const [mostrarCondicoesDropdown, setMostrarCondicoesDropdown] = useState(false);

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
            let cats = [];
            try { cats = await configService.get('categorias_vendas'); } catch (e) { }

            const paramsProd = { limit: 1000, ativo: true };
            if (Array.isArray(cats) && cats.length > 0) {
                paramsProd.categorias = cats.join(',');
            }

            const [clientesData, produtosData, condicoesData] = await Promise.all([
                clienteService.listar({ limit: 2000 }),
                produtoService.listar(paramsProd),
                tabelaPrecoService.listar()
            ]);

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
            setIsEncaixe(false);
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

            // Verify Delivery Date vs Visit Days immediately for today's date
            verificarDataEntrega(dataEntrega, cliente);

            // Permitted Conditions
            if (cliente.condicoes_pagamento_permitidas && cliente.condicoes_pagamento_permitidas.length > 0) {
                const permitidas = todasCondicoes.filter(c => cliente.condicoes_pagamento_permitidas.includes(c.idCondicao));
                setCondicoesPermitidas(permitidas);
                if (permitidas.length === 1) {
                    setCondicaoPagamentoId(permitidas[0].idCondicao);
                } else {
                    setCondicaoPagamentoId('');
                }
            } else if (cliente.Condicao_de_pagamento) {
                const padrao = todasCondicoes.find(c => c.idCondicao === cliente.Condicao_de_pagamento);
                setCondicoesPermitidas(padrao ? [padrao] : todasCondicoes);
                setCondicaoPagamentoId(cliente.Condicao_de_pagamento);
            } else {
                setCondicoesPermitidas(todasCondicoes);
                setCondicaoPagamentoId('');
            }
        }
    }, [clienteId, clientes, todasCondicoes]);

    useEffect(() => {
        if (clienteSelecionado) {
            verificarDataEntrega(dataEntrega, clienteSelecionado);
        }
    }, [dataEntrega]);

    const verificarDataEntrega = (dataStr, cliente) => {
        if (!dataStr || !cliente) return;
        const d = new Date(dataStr + 'T12:00:00Z'); // Evitar problemas de timezone
        const dayOfWeekStr = DIA_SEMANA_MAP[d.getUTCDay()];

        const diasVisita = cliente.Dia_de_entrega || ''; // "SEG,QUA"
        if (diasVisita && !diasVisita.includes(dayOfWeekStr)) {
            setIsEncaixe(true);
        } else {
            setIsEncaixe(false);
        }
    };

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
                valorBase: Number(valorBase.toFixed(2)),
                flexUnitario: Number(flexUnitario.toFixed(2))
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
            { id: Date.now().toString(), produtoId: '', quantidade: 1, valorUnitario: 0, valorBase: 0, flexUnitario: 0, search: '', showDropdown: false },
            ...itens
        ]);
    };

    const removerProduto = (idToRemove) => {
        const novos = itens.filter(i => i.id !== idToRemove);
        setItens(novos);
        calcularFlexTotal(novos);
    };

    const atualizarItem = async (idToUpdate, updates) => {
        let novosItens = [...itens];
        const idx = novosItens.findIndex(i => i.id === idToUpdate);
        if (idx === -1) return;

        let item = { ...novosItens[idx], ...updates };

        if ('produtoId' in updates && updates.produtoId) {
            const produto = produtos.find(p => p.id === updates.produtoId);
            if (produto) {
                const acrescimo = condicaoSelecionada ? Number(condicaoSelecionada.acrescimoPreco) : 0;
                const precoTabela = Number(produto.valorVenda) || 0;
                const valorBase = precoTabela * (1 + (acrescimo / 100));

                let valorPraticado = valorBase;

                if (clienteId) {
                    try {
                        const ultimo = await pedidoService.obterUltimoPreco(clienteId, updates.produtoId);
                        if (ultimo && ultimo.valor) {
                            valorPraticado = Number(ultimo.valor);
                        }
                    } catch (e) { }
                }

                item.valorBase = Number(valorBase.toFixed(2));
                item.valorUnitario = Number(valorPraticado.toFixed(2));
                item.flexUnitario = Number((item.valorUnitario - item.valorBase).toFixed(2));
                item.quantidade = 1;
                item.search = produto.nome;
                item.showDropdown = false;
            }
        } else if ('produtoId' in updates && updates.produtoId === '') {
            item.valorBase = 0;
            item.valorUnitario = 0;
            item.flexUnitario = 0;
            item.quantidade = 1;
        }

        if ('quantidade' in updates || 'valorUnitario' in updates) {
            const numValQtd = 'quantidade' in updates ? Number(updates.quantidade.toString().replace(',', '.')) || 0 : item.quantidade;
            const numValVal = 'valorUnitario' in updates ? Number(updates.valorUnitario.toString().replace(',', '.')) || 0 : item.valorUnitario;

            item.quantidade = numValQtd;
            item.valorUnitario = numValVal;
            item.flexUnitario = Number((item.valorUnitario - item.valorBase).toFixed(2));
        }

        setItens(prevItens => {
            const pIdx = prevItens.findIndex(i => i.id === idToUpdate);
            if (pIdx === -1) return prevItens;
            const newList = [...prevItens];
            newList[pIdx] = { ...newList[pIdx], ...item };
            setTimeout(() => calcularFlexTotal(newList), 0);
            return newList;
        });
    };

    const handleSalvar = (statusEnvio) => {
        if (!clienteId || itens.length === 0) {
            alert("Preencha cliente e adicione itens.");
            return;
        }

        if (!condicaoPagamentoId) {
            alert("Selecione uma condição de pagamento.");
            return;
        }

        if (itens.some(i => !i.produtoId || isNaN(i.valorUnitario) || i.quantidade <= 0)) {
            alert("Todos os itens adicionados devem ter um produto selecionado, valor e quantidade válidos.");
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
                    salvarPedido(statusEnvio, null);
                },
                { enableHighAccuracy: true, timeout: 5000 }
            );
        } else {
            salvarPedido(statusEnvio, null);
        }
    };

    const salvarPedido = async (statusEnvio, latLng) => {
        let obsFinal = observacoes;
        if (isEncaixe) {
            obsFinal = obsFinal ? `ENCAIXE DE ENTREGA\n${obsFinal}` : `ENCAIXE DE ENTREGA`;
        }

        // Apply string conversion cleanly before sending
        const itensLimpos = itens.map(i => ({
            produtoId: i.produtoId,
            quantidade: Number(i.quantidade.toString().replace(',', '.')),
            valor: Number(i.valorUnitario.toString().replace(',', '.')),
            valorBase: i.valorBase
        }));

        const payload = {
            clienteId,
            vendedorId,
            dataVenda: new Date(dataEntrega + 'T12:00:00Z').toISOString(),
            observacoes: obsFinal,
            tipoPagamento: condicaoSelecionada?.tipoPagamento,
            opcaoCondicaoPagamento: condicaoSelecionada?.opcaoCondicao,
            qtdParcelas: condicaoSelecionada?.qtdParcelas || 1,
            primeiroVencimento: null,
            intervaloDias: condicaoSelecionada?.parcelasDias || 0,
            idCategoria: null,
            latLng,
            statusEnvio,
            itens: itensLimpos
        };

        try {
            await pedidoService.criar(payload);
            navigate('/pedidos');
        } catch (error) {
            const msg = error.response?.data?.error || "Erro ao salvar pedido.";
            alert(msg);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-4 text-center">Carregando...</div>;

    const vTotal = itens.reduce((acc, i) => acc + ((Number(i.valorUnitario?.toString().replace(',', '.')) || 0) * (Number(i.quantidade?.toString().replace(',', '.')) || 0)), 0);

    return (
        <div className="bg-gray-50 min-h-screen pb-32">
            <div className="bg-white shadow-sm sticky top-0 z-10">
                <div className="flex items-center justify-between p-4">
                    <div className="flex items-center">
                        <button onClick={() => navigate(-1)} className="mr-3 text-gray-600">
                            <ArrowLeft className="h-6 w-6" />
                        </button>
                        <h1 className="text-xl font-bold text-gray-900">Novo Pedido</h1>
                    </div>
                    {/* Botão claro para salvar rascunho sem enviar */}
                    <button
                        onClick={() => handleSalvar('ABERTO')}
                        className="text-primary font-semibold text-sm hover:underline"
                    >
                        Salvar em Aberto
                    </button>
                </div>
                <div className={`px-4 py-2 flex justify-between items-center text-sm font-bold text-white shadow-inner ${flexTotal >= 0 ? 'bg-green-600' : 'bg-red-600'}`}>
                    <span>Saldo Flex do Pedido:</span>
                    <span>{flexTotal > 0 && '+'}{flexTotal.toFixed(2).replace('.', ',')}</span>
                </div>
            </div>

            <div className="p-4 space-y-4 max-w-lg mx-auto">
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
                                onFocus={(e) => {
                                    e.target.select();
                                    setShowClienteDropdown(true);
                                }}
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

                        {showClienteDropdown && !clienteId && (
                            <ul className="absolute z-30 mt-1 w-full bg-white border border-gray-200 shadow-xl max-h-60 rounded-md py-1 text-base ring-0 overflow-auto sm:text-sm">
                                {clientes
                                    .filter(c => !clienteSearchText || (c.NomeFantasia || c.Nome).toLowerCase().includes(clienteSearchText.toLowerCase()) || (c.Documento || '').includes(clienteSearchText))
                                    .slice(0, 50)
                                    .map(c => (
                                        <li
                                            key={c.UUID}
                                            className="text-gray-900 cursor-pointer select-none relative py-2 pl-3 pr-4 hover:bg-gray-100 border-b border-gray-50 last:border-0"
                                            onClick={() => setClienteId(c.UUID)}
                                        >
                                            <span className="font-bold block truncate leading-tight">{c.NomeFantasia || c.Nome}</span>
                                            <span className="text-gray-500 text-xs block truncate">{c.Documento || 'Sem Documento'}  • {c.End_Cidade || 'S/ Cidade'}</span>
                                            {c.Dia_de_entrega && <span className="text-blue-600 font-semibold text-xs inline-block mt-1 bg-blue-50 px-2 py-0.5 rounded">Entregas válidas: {c.Dia_de_entrega}</span>}
                                        </li>
                                    ))
                                }
                            </ul>
                        )}
                    </div>
                </div>

                {/* Data de Entrega */}
                {clienteId && (
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                            <Calendar className="h-4 w-4 mr-1" /> Data da Entrega
                        </label>
                        <input
                            type="date"
                            className="w-full border border-gray-300 rounded-md p-3 bg-white text-gray-900 focus:ring-primary focus:border-primary cursor-pointer"
                            value={dataEntrega}
                            onChange={e => setDataEntrega(e.target.value)}
                            onClick={(e) => {
                                try {
                                    // Força a abertura do calendário nativo do navegador ao clicar em qualquer lugar do campo
                                    if (e.target.showPicker) e.target.showPicker();
                                } catch (err) { }
                            }}
                        />
                        {clienteSelecionado && clienteSelecionado.Dia_de_entrega && (
                            <p className="text-xs text-gray-500 mt-2">Dias cadastrados p/ cliente: <b>{clienteSelecionado.Dia_de_entrega}</b></p>
                        )}
                        {isEncaixe && (
                            <div className="mt-2 text-xs flex items-start text-orange-700 bg-orange-50 p-2 rounded border border-orange-200">
                                <AlertCircle className="h-4 w-4 mr-1 flex-shrink-0" />
                                <span><b>Aviso de Encaixe:</b> A data escolhida não cai em um dia da semana cadastrado para entrega. Este pedido será marcado como Encaixe.</span>
                            </div>
                        )}
                    </div>
                )}

                {clienteId && (
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200  animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                            <DollarSign className="h-4 w-4 mr-1" /> Condição de Pagamento
                        </label>
                        <div className="relative">
                            <div
                                className="w-full border border-gray-300 rounded-md p-3 bg-white text-gray-900 font-bold focus:ring-primary cursor-pointer flex justify-between items-center"
                                onClick={() => setMostrarCondicoesDropdown(!mostrarCondicoesDropdown)}
                            >
                                <span>{condicaoSelecionada ? condicaoSelecionada.nomeCondicao : 'Selecione exatamente uma condição...'}</span>
                                <ChevronDown className="h-4 w-4 text-gray-400" />
                            </div>

                            {mostrarCondicoesDropdown && (
                                <ul className="absolute z-30 mt-1 w-full bg-white border border-gray-200 shadow-xl max-h-60 rounded-md py-1 text-base ring-0 overflow-auto sm:text-sm">
                                    {condicoesPermitidas.map(c => (
                                        <li
                                            key={c.idCondicao}
                                            className={`text-gray-900 cursor-pointer select-none relative py-3 pl-3 pr-4 hover:bg-gray-100 border-b border-gray-50 last:border-0 font-bold ${condicaoPagamentoId === c.idCondicao ? 'bg-blue-50 text-blue-800' : ''}`}
                                            onClick={() => {
                                                setCondicaoPagamentoId(c.idCondicao);
                                                setMostrarCondicoesDropdown(false);
                                            }}
                                        >
                                            <div className="flex justify-between items-center w-full">
                                                <span>{c.nomeCondicao}</span>
                                                {condicaoPagamentoId === c.idCondicao && <CheckCircle className="h-4 w-4 text-blue-600" />}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        {condicoesPermitidas.length === 0 && (
                            <p className="text-red-500 text-xs mt-2">O Administrador não habilitou nenhuma tabela de preço para este cliente.</p>
                        )}
                        {condicaoSelecionada && (
                            <div className="mt-2 text-xs text-gray-600 flex justify-between bg-blue-50 p-2 rounded">
                                <span>Acréscimo: <b>{condicaoSelecionada.acrescimoPreco}%</b></span>
                                <span>Parcelas: <b>{condicaoSelecionada.qtdParcelas}x de {condicaoSelecionada.parcelasDias} d</b></span>
                            </div>
                        )}
                    </div>
                )}

                {clienteId && condicaoPagamentoId && (
                    <div className="bg-white p-2 text-gray-900 rounded-lg shadow-sm border border-gray-200 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="p-2 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-lg">
                            <label className="text-sm font-bold text-gray-800 flex items-center">
                                <ShoppingCart className="h-4 w-4 mr-1" /> Produtos do Pedido
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
                                    <div key={item.id} className="relative p-3 border border-gray-200 rounded-md bg-white shadow-sm transition-all focus-within:ring-2 focus-within:ring-primary">

                                        {/* Autocomplete Produto */}
                                        <div className="pr-8 mb-3 relative">
                                            <input
                                                type="text"
                                                className={`w-full border border-gray-300 rounded p-2 text-sm font-semibold truncate ${item.produtoId ? 'bg-green-50 text-green-900 border-green-300' : 'bg-white text-gray-900'}`}
                                                placeholder="Digite nome ou código do produto..."
                                                value={item.search}
                                                onChange={e => {
                                                    let updates = { search: e.target.value, showDropdown: true };
                                                    if (e.target.value === '') {
                                                        updates.produtoId = '';
                                                    }
                                                    atualizarItem(item.id, updates);
                                                }}
                                                onFocus={(e) => {
                                                    e.target.select();
                                                    atualizarItem(item.id, { showDropdown: true });
                                                }}
                                                onBlur={() => setTimeout(() => atualizarItem(item.id, { showDropdown: false }), 200)}
                                            />
                                            {item.produtoId && (
                                                <CheckCircle className="absolute right-3 top-2.5 h-4 w-4 text-green-600" />
                                            )}

                                            {item.showDropdown && !item.produtoId && (
                                                <ul className="absolute z-40 mt-1 w-full bg-white border border-gray-200 shadow-2xl max-h-56 rounded-md py-1 text-sm ring-1 ring-black ring-opacity-5 overflow-auto">
                                                    {produtos
                                                        .filter(p => !item.search || (p.nome && p.nome.toLowerCase().includes(item.search.toLowerCase())) || (p.codigo && p.codigo.toLowerCase().includes(item.search.toLowerCase())))
                                                        .slice(0, 50)
                                                        .map(p => (
                                                            <li
                                                                key={p.id}
                                                                className="text-gray-900 cursor-pointer select-none relative py-2 pl-3 pr-4 hover:bg-gray-100 border-b border-gray-100"
                                                                onClick={() => {
                                                                    atualizarItem(item.id, { produtoId: p.id, showDropdown: false });
                                                                }}
                                                            >
                                                                <span className="font-bold block truncate">{p.nome}</span>
                                                                <span className="text-gray-500 text-xs mt-0.5 block truncate">Cód: {p.codigo} | Tabela: R$ {p.valorVenda}</span>
                                                            </li>
                                                        ))
                                                    }
                                                </ul>
                                            )}
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
                                                        min="0" step="any"
                                                        className="w-full border border-gray-300 bg-white text-gray-900 rounded p-2 text-center text-base font-bold shadow-inner"
                                                        value={item.quantidade}
                                                        onFocus={e => e.target.select()}
                                                        onChange={e => atualizarItem(item.id, { quantidade: e.target.value })}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-semibold text-gray-600 mb-1">R$ Un (Praticado)</label>
                                                    <input
                                                        type="number"
                                                        min="0" step="any"
                                                        className="w-full border border-gray-300 bg-white text-gray-900 rounded p-2 text-center text-base font-bold shadow-inner"
                                                        value={item.valorUnitario}
                                                        onFocus={e => e.target.select()}
                                                        onChange={e => atualizarItem(item.id, { valorUnitario: e.target.value })}
                                                    />
                                                    <div className="text-xs mt-1 text-center bg-gray-50 p-1 rounded border border-gray-100">
                                                        <span className="text-gray-500 block mb-0.5">Base (c/ Acrésc.): <b>{item.valorBase.toFixed(2)}</b></span>
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

                <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                        <FileText className="h-4 w-4 mr-1" /> Observações do Pedido
                    </label>
                    <textarea
                        className="w-full border border-gray-300 rounded-md shadow-sm p-3 text-sm focus:ring-primary focus:border-primary bg-white text-gray-900"
                        rows="3"
                        placeholder="Adicione restrições de doca, horários ou informações para o faturamento."
                        value={observacoes}
                        onChange={e => setObservacoes(e.target.value)}
                    ></textarea>
                </div>

                <div className="pt-2 text-center text-gray-500 text-xs flex items-center justify-center font-medium">
                    <MapPin className="h-3 w-3 mr-1" />
                    Localização capturada e enviada como registro do vendedor.
                </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.1)] z-20">
                <div className="max-w-lg mx-auto">
                    <div className="flex justify-between items-center mb-3">
                        <span className="text-gray-600 text-sm font-medium">Soma dos Itens:</span>
                        <span className="text-2xl font-extrabold text-gray-900">R$ {vTotal.toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div className="flex gap-3">
                        <button
                            disabled={saving}
                            onClick={() => handleSalvar('ENVIAR')}
                            className="flex-1 bg-primary text-white font-bold py-3 px-2 rounded-lg hover:bg-blue-700 active:bg-blue-800 shadow-md transition flex justify-center items-center outline-none"
                        >
                            <Save className="h-5 w-5 mr-2" />
                            FECHAR PEDIDO
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NovoPedido;
