import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft, Save, User, ChevronDown, ChevronUp, Calendar,
    FileText, AlertCircle, X, CheckCircle, Minus, Plus, Clock,
    ShoppingBag, Search, Trash2
} from 'lucide-react';
import clienteService from '../../services/clienteService';
import produtoService from '../../services/produtoService';
import tabelaPrecoService from '../../services/tabelaPrecoService';
import pedidoService from '../../services/pedidoService';
import configService from '../../services/configService';

const DIA_SEMANA_MAP = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

// Formata data para exibição dd/mm
const fmtData = (d) => {
    if (!d) return '-';
    const dt = new Date(d);
    return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
};

const NovoPedido = () => {
    const navigate = useNavigate();
    const { id: editId } = useParams();
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
    const [dataEntrega, setDataEntrega] = useState(new Date().toISOString().split('T')[0]);
    const [isEncaixe, setIsEncaixe] = useState(false);
    const [observacoes, setObservacoes] = useState('');

    // itens: Map produtoId → { quantidade, valorUnitario, valorBase, flexUnitario }
    const [itensMap, setItensMap] = useState(new Map());

    // Client/Product Search State
    const [clienteSearchText, setClienteSearchText] = useState('');
    const [showClienteDropdown, setShowClienteDropdown] = useState(false);
    const [mostrarCondicoesDropdown, setMostrarCondicoesDropdown] = useState(false);
    const [mostrarFormulario, setMostrarFormulario] = useState(true);
    const [produtoSearch, setProdutoSearch] = useState('');
    const [obsAberta, setObsAberta] = useState(false);
    const [expandidosProduto, setExpandidosProduto] = useState(new Set());

    // Histórico de compras do cliente por produto
    const [historicoMap, setHistoricoMap] = useState(new Map()); // produtoId → { ultimoPreco, ultimaCompra, compras[] }

    // Computed/Derived
    const [condicoesPermitidas, setCondicoesPermitidas] = useState([]);
    const [clienteSelecionado, setClienteSelecionado] = useState(null);
    const [condicaoSelecionada, setCondicaoSelecionada] = useState(null);
    const [flexTotal, setFlexTotal] = useState(0);

    const carregouDraftRef = useRef(false);
    const searchInputRef = useRef(null);

    useEffect(() => { carregarDadosBase(); }, []);

    const carregarDadosBase = async () => {
        try {
            let cats = [];
            try { cats = await configService.get('categorias_vendas'); } catch (e) { }
            const paramsProd = { limit: 1000, ativo: true };
            if (Array.isArray(cats) && cats.length > 0) paramsProd.categorias = cats.join(',');

            const [clientesData, produtosData, condicoesData] = await Promise.all([
                clienteService.listar({ limit: 2000 }),
                produtoService.listar(paramsProd),
                tabelaPrecoService.listar()
            ]);

            setClientes(clientesData.data?.filter(c => c.Ativo) || clientesData?.filter(c => c.Ativo) || []);
            setProdutos(produtosData.data || produtosData || []);
            setTodasCondicoes(condicoesData);

            if (editId) {
                try {
                    const pd = await pedidoService.detalhar(editId);
                    if (pd) {
                        setClienteId(pd.clienteId);
                        setObservacoes(pd.observacoes || '');
                        if (pd.dataVenda) setDataEntrega(pd.dataVenda.split('T')[0]);
                        const cond = condicoesData.find(c => c.tipoPagamento === pd.tipoPagamento && c.opcaoCondicao === pd.opcaoCondicaoPagamento);
                        if (cond) setTimeout(() => setCondicaoPagamentoId(cond.idCondicao), 500);

                        if (pd.itens && pd.itens.length > 0) {
                            const map = new Map();
                            pd.itens.forEach(i => {
                                map.set(i.produtoId, {
                                    quantidade: i.quantidade,
                                    valorUnitario: Number(i.valor),
                                    valorBase: Number(i.valorBase),
                                    flexUnitario: Number((Number(i.valor) - Number(i.valorBase)).toFixed(2))
                                });
                            });
                            setItensMap(map);
                        }
                        carregouDraftRef.current = true;
                    }
                } catch (e) {
                    alert("Erro ao carregar o rascunho de pedido.");
                    navigate('/pedidos');
                }
            }
        } catch (error) {
            alert("Erro ao carregar dados básicos para o pedido.");
        } finally {
            setLoading(false);
        }
    };

    // Recalcular flex sempre que itensMap mudar
    useEffect(() => {
        let total = 0;
        itensMap.forEach(item => { total += item.flexUnitario * item.quantidade; });
        setFlexTotal(total);
    }, [itensMap]);

    // Quando cliente muda
    useEffect(() => {
        if (!clienteId) {
            setClienteSelecionado(null);
            setVendedorId(null);
            setCondicoesPermitidas([]);
            setCondicaoPagamentoId('');
            setIsEncaixe(false);
            setHistoricoMap(new Map());
            return;
        }
        const cliente = clientes.find(c => c.UUID === clienteId);
        if (cliente) {
            if (!cliente.idVendedor) {
                alert("Este cliente não tem um vendedor associado! Não é possível criar pedido.");
                setClienteId(''); setClienteSearchText(''); return;
            }
            setClienteSelecionado(cliente);
            setVendedorId(cliente.idVendedor);
            setClienteSearchText(cliente.NomeFantasia || cliente.Nome);
            verificarDataEntrega(dataEntrega, cliente);

            let idsArray = [];
            if (Array.isArray(cliente.condicoes_pagamento_permitidas)) idsArray = cliente.condicoes_pagamento_permitidas;
            else if (typeof cliente.condicoes_pagamento_permitidas === 'string' && cliente.condicoes_pagamento_permitidas.trim().length > 0)
                idsArray = cliente.condicoes_pagamento_permitidas.split(',').map(s => s.trim());

            let permitidas = idsArray.length > 0
                ? todasCondicoes.filter(c => idsArray.includes(c.idCondicao) || idsArray.includes(c.id))
                : (cliente.Condicao_de_pagamento ? [todasCondicoes.find(c => c.idCondicao === cliente.Condicao_de_pagamento || c.id === cliente.Condicao_de_pagamento)].filter(Boolean) : []);

            setCondicoesPermitidas(permitidas);

            if (!editId || !carregouDraftRef.current) {
                const padrao = todasCondicoes.find(c => c.idCondicao === cliente.Condicao_de_pagamento || c.id === cliente.Condicao_de_pagamento);
                if (permitidas.length === 1) setCondicaoPagamentoId(permitidas[0].idCondicao);
                else if (padrao && permitidas.some(c => c.idCondicao === padrao.idCondicao)) setCondicaoPagamentoId(padrao.idCondicao);
                else setCondicaoPagamentoId('');
            }

            // Carregar histórico de compras do cliente
            pedidoService.historicoComprasCliente(clienteId).then(historico => {
                const map = new Map();
                if (Array.isArray(historico)) {
                    historico.forEach(h => map.set(h.produtoId, h));
                }
                setHistoricoMap(map);
            }).catch(() => { });

            // Fechar o formulário para dar espaço à lista de produtos
            setMostrarFormulario(false);
        }
    }, [clienteId, clientes, todasCondicoes]);

    useEffect(() => {
        if (clienteSelecionado) verificarDataEntrega(dataEntrega, clienteSelecionado);
    }, [dataEntrega]);

    const verificarDataEntrega = (dataStr, cliente) => {
        if (!dataStr || !cliente) return;
        const d = new Date(dataStr + 'T12:00:00Z');
        const dayOfWeekStr = DIA_SEMANA_MAP[d.getUTCDay()];
        const diasVisita = cliente.Dia_de_entrega || '';
        if (diasVisita && !diasVisita.includes(dayOfWeekStr)) {
            if (!isEncaixe) alert(`Aviso de Encaixe: A data escolhida não cai em um dia da semana cadastrado para entrega p/ este cliente. Este pedido será marcado como Encaixe.`);
            setIsEncaixe(true);
        } else {
            setIsEncaixe(false);
        }
    };

    useEffect(() => {
        const cond = todasCondicoes.find(c => c.idCondicao === condicaoPagamentoId);
        setCondicaoSelecionada(cond || null);
        if (cond) recalcularItens(cond);
    }, [condicaoPagamentoId]);

    const recalcularItens = (condicao) => {
        if (!condicao) return;
        const acrescimo = Number(condicao.acrescimoPreco) || 0;
        setItensMap(prev => {
            const novo = new Map(prev);
            novo.forEach((item, pid) => {
                const produto = produtos.find(p => p.id === pid);
                if (!produto) return;
                const precoTabela = Number(produto.valorVenda) || 0;
                const valorBase = precoTabela * (1 + acrescimo / 100);
                novo.set(pid, {
                    ...item,
                    valorBase: Number(valorBase.toFixed(2)),
                    flexUnitario: Number((item.valorUnitario - valorBase).toFixed(2))
                });
            });
            return novo;
        });
    };

    // Adicionar/atualizar quantidade de um produto
    const setQuantidade = useCallback(async (produtoId, novaQtd) => {
        if (novaQtd <= 0) {
            setItensMap(prev => { const m = new Map(prev); m.delete(produtoId); return m; });
            return;
        }
        setItensMap(prev => {
            const m = new Map(prev);
            const existente = m.get(produtoId);
            if (existente) {
                m.set(produtoId, { ...existente, quantidade: novaQtd });
            } else {
                // Novo produto: calcular preço
                const produto = produtos.find(p => p.id === produtoId);
                const acrescimo = condicaoSelecionada ? Number(condicaoSelecionada.acrescimoPreco) : 0;
                const precoTabela = Number(produto?.valorVenda || 0);
                const valorBase = precoTabela * (1 + acrescimo / 100);
                const hist = historicoMap.get(produtoId);
                const valorPraticado = hist?.ultimoPreco || valorBase;
                m.set(produtoId, {
                    quantidade: novaQtd,
                    valorUnitario: Number(valorPraticado.toFixed(2)),
                    valorBase: Number(valorBase.toFixed(2)),
                    flexUnitario: Number((valorPraticado - valorBase).toFixed(2))
                });
                // Buscar último preço real no backend
                if (clienteId) {
                    pedidoService.obterUltimoPreco(clienteId, produtoId).then(res => {
                        if (res?.valor) {
                            setItensMap(prev2 => {
                                const m2 = new Map(prev2);
                                const it = m2.get(produtoId);
                                if (it) {
                                    const vp = Number(res.valor);
                                    m2.set(produtoId, { ...it, valorUnitario: vp, flexUnitario: Number((vp - it.valorBase).toFixed(2)) });
                                }
                                return m2;
                            });
                        }
                    }).catch(() => { });
                }
            }
            return m;
        });
    }, [produtos, condicaoSelecionada, historicoMap, clienteId]);

    const setValorUnitario = useCallback((produtoId, valor) => {
        setItensMap(prev => {
            const m = new Map(prev);
            const it = m.get(produtoId);
            if (!it) return prev;
            const vp = Number(valor.toString().replace(',', '.')) || 0;
            m.set(produtoId, { ...it, valorUnitario: vp, flexUnitario: Number((vp - it.valorBase).toFixed(2)) });
            return m;
        });
    }, []);

    const handleSalvar = (statusEnvio) => {
        if (!clienteId || itensMap.size === 0) { alert("Preencha cliente e adicione itens."); return; }
        if (!condicaoPagamentoId) { alert("Selecione uma condição de pagamento."); return; }
        setSaving(true);
        if (navigator.geolocation && statusEnvio === 'ENVIAR') {
            navigator.geolocation.getCurrentPosition(
                pos => salvarPedido(statusEnvio, `${pos.coords.latitude},${pos.coords.longitude}`),
                () => salvarPedido(statusEnvio, null),
                { enableHighAccuracy: true, timeout: 5000 }
            );
        } else {
            salvarPedido(statusEnvio, null);
        }
    };

    const salvarPedido = async (statusEnvio, latLng) => {
        let obsFinal = observacoes;
        if (isEncaixe) obsFinal = obsFinal ? `ENCAIXE DE ENTREGA\n${obsFinal}` : `ENCAIXE DE ENTREGA`;

        const itensLimpos = [];
        itensMap.forEach((item, pid) => {
            itensLimpos.push({
                produtoId: pid,
                quantidade: Number(item.quantidade.toString().replace(',', '.')),
                valor: Number(item.valorUnitario.toString().replace(',', '.')),
                valorBase: item.valorBase
            });
        });

        const payload = {
            clienteId, vendedorId,
            dataVenda: new Date(dataEntrega + 'T12:00:00Z').toISOString(),
            observacoes: obsFinal,
            tipoPagamento: condicaoSelecionada?.tipoPagamento,
            opcaoCondicaoPagamento: condicaoSelecionada?.opcaoCondicao,
            qtdParcelas: condicaoSelecionada?.qtdParcelas || 1,
            primeiroVencimento: null,
            intervaloDias: condicaoSelecionada?.parcelasDias || 0,
            idCategoria: null, latLng, statusEnvio,
            itens: itensLimpos
        };

        try {
            if (editId) await pedidoService.atualizar(editId, payload);
            else await pedidoService.criar(payload);
            navigate('/pedidos');
        } catch (error) {
            alert(error.response?.data?.error || "Erro ao salvar pedido.");
        } finally {
            setSaving(false);
        }
    };

    const handleExcluir = async () => {
        if (!editId) return;
        if (!window.confirm("Tem certeza que deseja excluir permanentemente este rascunho?")) return;
        setSaving(true);
        try {
            await pedidoService.excluir(editId);
            navigate('/pedidos');
        } catch (error) {
            alert(error.response?.data?.error || "Erro ao excluir o pedido.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
                <p className="text-sm text-gray-500">Carregando...</p>
            </div>
        </div>
    );

    const vTotal = Array.from(itensMap.values()).reduce(
        (acc, i) => acc + (Number(i.valorUnitario) * Number(i.quantidade)), 0
    );

    // Ordenar produtos: já comprados (por data desc) e depois os demais (alfabético)
    const produtosJaComprados = [];
    const produtosOutros = [];

    // Filtrar
    const termoBusca = produtoSearch.toLowerCase().trim();
    const produtosFiltrados = produtos.filter(p => {
        if (!termoBusca) return true;
        return (p.nome && p.nome.toLowerCase().includes(termoBusca))
            || (p.codigo && p.codigo.toLowerCase().includes(termoBusca));
    });

    // Separar em já comprados e outros
    const historicoPorData = Array.from(historicoMap.entries())
        .sort((a, b) => new Date(b[1].ultimaCompra) - new Date(a[1].ultimaCompra));

    const jaCompradosIds = new Set(historicoPorData.map(([pid]) => pid));

    // Montar lista na ordem: histórico (com os produtos enriquecidos) → outros (alfabético)
    historicoPorData.forEach(([pid, hist]) => {
        const prod = produtosFiltrados.find(p => p.id === pid);
        if (prod) produtosJaComprados.push({ ...prod, hist });
    });

    produtosFiltrados
        .filter(p => !jaCompradosIds.has(p.id))
        .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
        .forEach(p => produtosOutros.push({ ...p, hist: null }));

    const ListaProdutoRow = ({ produto }) => {
        const item = itensMap.get(produto.id);
        const qtd = item?.quantidade || 0;
        const valor = item?.valorUnitario;
        const hist = produto.hist;
        const expandido = expandidosProduto.has(produto.id);

        const toggleExpand = () => {
            setExpandidosProduto(prev => {
                const n = new Set(prev);
                n.has(produto.id) ? n.delete(produto.id) : n.add(produto.id);
                return n;
            });
        };

        return (
            <div className={`border-b border-gray-100 ${qtd > 0 ? 'bg-blue-50/60' : 'bg-white'}`}>
                <div className="flex items-center gap-2 px-3 py-2.5">
                    {/* Nome e preço */}
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-800 leading-tight">{produto.nome}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                            {qtd > 0 ? (
                                <input
                                    type="number"
                                    min="0" step="any"
                                    className="w-20 border border-blue-300 bg-white text-blue-800 rounded px-1.5 py-0.5 text-sm font-bold text-center"
                                    value={valor}
                                    onFocus={e => e.target.select()}
                                    onChange={e => setValorUnitario(produto.id, e.target.value)}
                                />
                            ) : (
                                <span className="text-xs font-bold text-orange-600">
                                    R$ {Number(produto.valorVenda || 0).toFixed(2).replace('.', ',')}
                                </span>
                            )}
                            {qtd > 0 && item && (
                                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${item.flexUnitario >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {item.flexUnitario >= 0 ? '+' : ''}{item.flexUnitario.toFixed(2)}
                                </span>
                            )}
                            {hist && (
                                <button onClick={toggleExpand} className="text-gray-400 ml-auto">
                                    {expandido ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Controles de quantidade */}
                    <div className="flex items-center gap-1 shrink-0">
                        {qtd > 0 && (
                            <button
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => setQuantidade(produto.id, qtd - 1)}
                                className="w-8 h-8 flex items-center justify-center rounded-full bg-red-100 text-red-600 active:bg-red-200 text-lg font-bold"
                            >
                                <Minus className="h-4 w-4" />
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
                                    if (v >= 0) setQuantidade(produto.id, v);
                                }}
                            />
                        )}
                        <button
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => setQuantidade(produto.id, qtd + 1)}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 text-white active:bg-blue-700 shadow-sm"
                        >
                            <Plus className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Histórico de compras expansível */}
                {expandido && hist && hist.compras && hist.compras.length > 0 && (
                    <div className="px-3 pb-2 bg-gray-50 border-t border-gray-100">
                        <table className="w-full text-xs mt-1.5">
                            <thead>
                                <tr className="text-gray-500">
                                    <th className="text-left font-medium pb-1">Pedido</th>
                                    <th className="text-center font-medium pb-1">Qtde</th>
                                    <th className="text-right font-medium pb-1">R$ Un</th>
                                    <th className="text-right font-medium pb-1">Data</th>
                                </tr>
                            </thead>
                            <tbody>
                                {hist.compras.map((c, i) => (
                                    <tr key={i} className="border-t border-gray-100">
                                        <td className="py-0.5 text-gray-600">#{c.numero || '-'}</td>
                                        <td className="py-0.5 text-center font-semibold text-gray-800">{c.quantidade}</td>
                                        <td className="py-0.5 text-right font-semibold text-gray-800">{Number(c.valor).toFixed(2).replace('.', ',')}</td>
                                        <td className="py-0.5 text-right text-gray-500">{fmtData(c.data)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="bg-gray-50 min-h-screen flex flex-col">
            {/* ===== HEADER COMPACTO ===== */}
            <div className="bg-white shadow-sm sticky top-0 z-20">
                <div className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2">
                        <button onClick={() => navigate(-1)} className="text-gray-600 p-1">
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                        <h1 className="text-base font-bold text-gray-900">
                            {editId ? 'Editar Pedido' : 'Novo Pedido'}
                        </h1>
                        {isEncaixe && (
                            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">ENCAIXE</span>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        {editId && (
                            <button onClick={handleExcluir} className="text-red-500 text-xs font-semibold">
                                <Trash2 className="h-4 w-4" />
                            </button>
                        )}
                        <button onClick={() => handleSalvar('ABERTO')} className="text-blue-600 font-semibold text-xs">
                            Salvar
                        </button>
                    </div>
                </div>

                {/* Barra flex */}
                <div className={`px-4 py-1 flex justify-between items-center text-xs font-bold text-white ${flexTotal >= 0 ? 'bg-green-600' : 'bg-red-600'}`}>
                    <span>Flex: {flexTotal > 0 && '+'}{flexTotal.toFixed(2).replace('.', ',')}</span>
                    <span className="font-normal opacity-80">
                        {itensMap.size} {itensMap.size === 1 ? 'item' : 'itens'} · Total: R$ {vTotal.toFixed(2).replace('.', ',')}
                    </span>
                </div>
            </div>

            {/* ===== FORMULÁRIO (cliente + data + condição) ===== */}
            <div className="bg-white shadow-sm">
                {/* Campo cliente sempre visível */}
                <div className="px-3 py-2 border-b border-gray-100">
                    <div className="relative">
                        <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-400 shrink-0" />
                            <input
                                type="text"
                                className="flex-1 text-sm font-semibold text-gray-900 bg-transparent outline-none placeholder-gray-400"
                                placeholder="Buscar cliente..."
                                value={clienteSearchText}
                                onChange={e => { setClienteSearchText(e.target.value); setShowClienteDropdown(true); if (!e.target.value) setClienteId(''); }}
                                onFocus={e => { e.target.select(); setShowClienteDropdown(true); }}
                                onBlur={() => setTimeout(() => setShowClienteDropdown(false), 200)}
                            />
                            {clienteId && (
                                <button onClick={() => { setClienteId(''); setClienteSearchText(''); }} className="text-gray-400">
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>

                        {showClienteDropdown && !clienteId && (
                            <ul className="absolute z-40 left-0 right-0 mt-1 bg-white border border-gray-200 shadow-2xl max-h-52 rounded-md overflow-auto">
                                {clientes
                                    .filter(c => !clienteSearchText || (c.NomeFantasia || c.Nome).toLowerCase().includes(clienteSearchText.toLowerCase()) || (c.Documento || '').includes(clienteSearchText))
                                    .slice(0, 40)
                                    .map(c => (
                                        <li key={c.UUID}
                                            className="py-2.5 px-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 active:bg-gray-100"
                                            onClick={() => setClienteId(c.UUID)}>
                                            <div className="font-bold text-sm text-gray-900">{c.NomeFantasia || c.Nome}</div>
                                            <div className="text-xs text-gray-500">{c.Documento || 'Sem Doc'} · {c.End_Cidade || ''}</div>
                                            {c.Dia_de_entrega && <span className="text-blue-600 text-xs font-semibold">Entregas: {c.Dia_de_entrega}</span>}
                                        </li>
                                    ))}
                            </ul>
                        )}
                    </div>
                </div>

                {/* Data + Condição compactas (collapsível) */}
                {clienteId && (
                    <>
                        <button
                            className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
                            onClick={() => setMostrarFormulario(!mostrarFormulario)}
                        >
                            <span className="flex items-center gap-2">
                                <Calendar className="h-3.5 w-3.5" />
                                <span>{dataEntrega.split('-').reverse().join('/')}</span>
                                <span className="text-gray-300">·</span>
                                <span className="font-semibold text-gray-700 truncate max-w-[150px]">
                                    {condicaoSelecionada?.nomeCondicao || 'Sem condição'}
                                </span>
                                {condicaoSelecionada && <span className="text-gray-400">({condicaoSelecionada.acrescimoPreco}%)</span>}
                            </span>
                            {mostrarFormulario ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>

                        {mostrarFormulario && (
                            <div className="px-3 pb-3 pt-1 space-y-2 border-t border-gray-100">
                                {/* Data */}
                                <div>
                                    <label className="text-xs text-gray-500 font-medium">Data de Entrega</label>
                                    <input
                                        type="date"
                                        className="w-full mt-0.5 border border-gray-300 rounded-md p-2 bg-white text-gray-900 text-sm focus:ring-blue-500 focus:border-blue-500"
                                        value={dataEntrega}
                                        onChange={e => setDataEntrega(e.target.value)}
                                        onClick={e => { try { if (e.target.showPicker) e.target.showPicker(); } catch (err) { } }}
                                    />
                                    {clienteSelecionado?.Dia_de_entrega && (
                                        <p className="text-xs text-gray-400 mt-1">Dias do cliente: <b>{clienteSelecionado.Dia_de_entrega}</b></p>
                                    )}
                                </div>

                                {/* Condição de pagamento */}
                                <div className="relative">
                                    <label className="text-xs text-gray-500 font-medium">Condição de Pagamento</label>
                                    <div
                                        className="mt-0.5 w-full border border-gray-300 rounded-md p-2 bg-white text-gray-900 text-sm font-semibold flex justify-between items-center cursor-pointer"
                                        onClick={() => setMostrarCondicoesDropdown(!mostrarCondicoesDropdown)}
                                    >
                                        <span className={condicaoSelecionada ? 'text-gray-900' : 'text-gray-400 font-normal'}>
                                            {condicaoSelecionada ? condicaoSelecionada.nomeCondicao : 'Selecione...'}
                                        </span>
                                        <ChevronDown className="h-4 w-4 text-gray-400" />
                                    </div>
                                    {mostrarCondicoesDropdown && (
                                        <ul className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 shadow-xl max-h-52 rounded-md overflow-auto">
                                            {condicoesPermitidas.map(c => (
                                                <li key={c.idCondicao}
                                                    className={`py-2.5 px-3 text-sm font-semibold cursor-pointer hover:bg-gray-50 border-b border-gray-50 flex justify-between ${condicaoPagamentoId === c.idCondicao ? 'bg-blue-50 text-blue-800' : 'text-gray-900'}`}
                                                    onClick={() => { setCondicaoPagamentoId(c.idCondicao); setMostrarCondicoesDropdown(false); setMostrarFormulario(false); }}>
                                                    {c.nomeCondicao}
                                                    {condicaoPagamentoId === c.idCondicao && <CheckCircle className="h-4 w-4 text-blue-600" />}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {condicoesPermitidas.length === 0 && (
                                        <p className="text-red-500 text-xs mt-1">Nenhuma tabela de preço habilitada para este cliente.</p>
                                    )}
                                </div>

                                {/* Observações */}
                                <div>
                                    <button
                                        onClick={() => setObsAberta(!obsAberta)}
                                        className="text-xs text-gray-500 flex items-center gap-1"
                                    >
                                        <FileText className="h-3.5 w-3.5" />
                                        {obsAberta ? 'Fechar observações' : 'Adicionar observações'}
                                    </button>
                                    {obsAberta && (
                                        <textarea
                                            className="w-full mt-1.5 border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900"
                                            rows="2"
                                            placeholder="Restrições de doca, horários..."
                                            value={observacoes}
                                            onChange={e => setObservacoes(e.target.value)}
                                        />
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ===== LISTA DE PRODUTOS ===== */}
            {clienteId && condicaoPagamentoId && (
                <div className="flex-1">
                    {/* Campo de busca de produto fixo */}
                    <div className="bg-gray-100 px-3 py-2 sticky top-[72px] z-10 border-b border-gray-200">
                        <div className="flex items-center bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 gap-2 shadow-sm">
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
                    </div>

                    {/* Produtos já comprados */}
                    {produtosJaComprados.length > 0 && (
                        <div>
                            <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-100 flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5 text-amber-600" />
                                <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">Já Comprados</span>
                            </div>
                            {produtosJaComprados.map(p => <ListaProdutoRow key={p.id} produto={p} />)}
                        </div>
                    )}

                    {/* Outros produtos */}
                    {produtosOutros.length > 0 && (
                        <div>
                            <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-200 flex items-center gap-1.5">
                                <ShoppingBag className="h-3.5 w-3.5 text-gray-500" />
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                                    {produtosJaComprados.length > 0 ? 'Outros Produtos' : 'Produtos'}
                                </span>
                            </div>
                            {produtosOutros.map(p => <ListaProdutoRow key={p.id} produto={p} />)}
                        </div>
                    )}

                    {produtosJaComprados.length === 0 && produtosOutros.length === 0 && (
                        <div className="text-center py-12 text-gray-400">
                            <Search className="h-10 w-10 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">Nenhum produto encontrado</p>
                        </div>
                    )}
                </div>
            )}

            {/* Placeholder quando sem condição */}
            {clienteId && !condicaoPagamentoId && (
                <div className="flex-1 flex items-center justify-center p-8 text-center">
                    <div>
                        <AlertCircle className="h-10 w-10 text-amber-400 mx-auto mb-3" />
                        <p className="text-sm text-gray-600 font-medium">Selecione uma condição de pagamento</p>
                        <p className="text-xs text-gray-400 mt-1">Toque na barra acima para expandir o formulário</p>
                    </div>
                </div>
            )}

            {/* Placeholder sem cliente */}
            {!clienteId && (
                <div className="flex-1 flex items-center justify-center p-8 text-center">
                    <div>
                        <User className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm text-gray-500 font-medium">Busque um cliente para começar</p>
                    </div>
                </div>
            )}

            {/* ===== FOOTER FECHAR PEDIDO ===== */}
            {itensMap.size > 0 && (
                <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-3 py-2 shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.1)] z-20">
                    <button
                        disabled={saving}
                        onClick={() => handleSalvar('ENVIAR')}
                        className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 active:bg-blue-800 shadow-md flex items-center justify-center gap-2 text-base"
                    >
                        <Save className="h-5 w-5" />
                        FECHAR PEDIDO · R$ {vTotal.toFixed(2).replace('.', ',')}
                    </button>
                </div>
            )}
        </div>
    );
};

export default NovoPedido;
