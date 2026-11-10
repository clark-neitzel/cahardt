import React, { useState, useEffect, useMemo } from 'react';
import { Search, CheckSquare, Square, MinusSquare, X, Package, MapPin, User } from 'lucide-react';
import toast from 'react-hot-toast';
import embarqueService from '../../../services/embarqueService';
import SelectBusca from '../../../components/SelectBusca';
import MultiSelect from '../../../components/MultiSelect';
import FiltroPeriodo, { usePeriodoSalvo } from '../../../components/FiltroPeriodo';
import { useFiltrosSalvos } from '../../../hooks/useFiltrosSalvos';

const TipoBadge = ({ pedido }) => {
    if (pedido.bonificacao) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200">BN</span>;
    if (pedido.especial) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700 border border-purple-200">ZZ</span>;
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-mint text-primaryDark border border-primary/20">NF</span>;
};

// Chave do dia 'YYYY-MM-DD' (mesma para filtro e exibição — evita o dia anterior por fuso)
const chaveDia = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return isNaN(dt) ? '' : dt.toISOString().slice(0, 10);
};

const fmtData = (d) => {
    const k = chaveDia(d);
    if (!k) return null;
    const [a, m, dia] = k.split('-');
    return `${dia}/${m}/${a.slice(2)}`;
};

const fmtDiaMes = (d) => {
    const k = chaveDia(d);
    if (!k) return null;
    return `${k.slice(8, 10)}/${k.slice(5, 7)}`;
};

const moeda = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Valor do pedido (bonificação conta 0 nas somas)
const valorNum = (p) => {
    if (p.bonificacao || !p.itens?.length) return 0;
    return p.itens.reduce((acc, i) => acc + (Number(i.valor || i.precoUnitario || 0) * Number(i.quantidade || 0)), 0);
};

const ValorPedido = ({ pedido }) => {
    if (pedido.bonificacao) return <span className="text-green-700 font-bold text-[11px]">BONIFICAÇÃO</span>;
    const v = valorNum(pedido);
    if (v === 0) return null;
    return <span className="font-bold text-primaryDark">{moeda(v)}</span>;
};

const nomeCli = (p) => p.cliente?.NomeFantasia || p.cliente?.Nome || 'Cliente não encontrado';
const razao = (p) => {
    const f = p.cliente?.NomeFantasia, n = p.cliente?.Nome;
    return f && n && f !== n ? n : null;
};
const condicaoDe = (p) => p.nomeCondicaoPagamento || p.opcaoCondicaoPagamento || p.tipoPagamento || '';
const numeroDe = (p) => p.numero || 'S/N';

// Checkbox visual (a linha toda é o alvo de clique)
const Caixa = ({ estado, cor = 'text-primary' }) => {
    if (estado === 'todos') return <CheckSquare className={`h-5 w-5 ${cor}`} />;
    if (estado === 'parcial') return <MinusSquare className={`h-5 w-5 ${cor}`} />;
    return <Square className="h-5 w-5 text-gray-300" />;
};

const SEM_CIDADE = 'Sem cidade';

const AdicionarPedidosModal = ({ embarqueId, onClose, onSuccess }) => {
    const [pedidosLivres, setPedidosLivres] = useState([]);
    const [amostrasLivres, setAmostrasLivres] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selecionados, setSelecionados] = useState(new Set());
    const [amostrasSelecionadas, setAmostrasSelecionadas] = useState(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [aba, setAba] = useState('pedidos');
    const [filtros, setFiltros] = useFiltrosSalvos('embarcar-pedidos', { tipo: 'todos', vendedores: [], agruparCidade: true });
    const [periodo, periodoCtl] = usePeriodoSalvo('embarcar-pedidos', 'todo');
    const filtroTipo = filtros.tipo || 'todos';
    const filtroVendedores = Array.isArray(filtros.vendedores) ? filtros.vendedores : [];
    const agruparCidade = filtros.agruparCidade !== false;

    useEffect(() => {
        const fetchLivres = async () => {
            try {
                const [livres, amostras] = await Promise.all([
                    embarqueService.listarPedidosLivres(),
                    embarqueService.listarAmostrasDisponiveis()
                ]);
                setPedidosLivres(livres);
                setAmostrasLivres(amostras);
            } catch {
                toast.error('Erro ao buscar fila de faturamento.');
            } finally {
                setLoading(false);
            }
        };
        fetchLivres();
    }, []);

    const vendedoresUnicos = useMemo(() => {
        const map = new Map();
        pedidosLivres.forEach(p => {
            if (p.vendedor?.nome) map.set(p.vendedor.nome, p.vendedor.nome);
        });
        return Array.from(map.values()).sort();
    }, [pedidosLivres]);

    const toggleSelecao = (id) => {
        const novoSet = new Set(selecionados);
        if (novoSet.has(id)) novoSet.delete(id);
        else novoSet.add(id);
        setSelecionados(novoSet);
    };

    const toggleAmostra = (id) => {
        const novoSet = new Set(amostrasSelecionadas);
        if (novoSet.has(id)) novoSet.delete(id);
        else novoSet.add(id);
        setAmostrasSelecionadas(novoSet);
    };

    const pedidosFiltrados = useMemo(() => {
        const termo = searchTerm.toLowerCase();
        const lista = pedidosLivres.filter(p => {
            const condicao = condicaoDe(p).toLowerCase();
            const clienteNome = (p.cliente?.NomeFantasia || p.cliente?.Nome || '').toLowerCase();
            const cidade = (p.cliente?.End_Cidade || '').toLowerCase();
            const vendedorNome = (p.vendedor?.nome || '').toLowerCase();
            const tipoAbreviacao = p.bonificacao ? 'bn' : (p.especial ? 'zz' : 'ca');
            const dataVenda = p.dataVenda ? new Date(p.dataVenda).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';

            const strBusca = `${clienteNome} ${String(p.numero || '')} ${cidade} ${vendedorNome} ${condicao} ${dataVenda} ${tipoAbreviacao}`;
            const buscaOk = termo === '' || strBusca.includes(termo);
            const vendedorOk = filtroVendedores.length === 0 || filtroVendedores.includes(p.vendedor?.nome);
            const tipoOk = filtroTipo === 'todos' ||
                (filtroTipo === 'normal' && !p.especial && !p.bonificacao) ||
                (filtroTipo === 'especial' && p.especial) ||
                (filtroTipo === 'bonificacao' && p.bonificacao);
            let dataOk = true;
            if (periodo.de || periodo.ate) {
                const dia = chaveDia(p.dataVenda);
                if (!dia) {
                    dataOk = false;
                } else {
                    if (periodo.de && dia < periodo.de) dataOk = false;
                    if (periodo.ate && dia > periodo.ate) dataOk = false;
                }
            }
            return buscaOk && vendedorOk && tipoOk && dataOk;
        });
        // Cidade (sem cidade no fim) e depois nº
        return lista.sort((a, b) => {
            const ca = a.cliente?.End_Cidade || '', cb = b.cliente?.End_Cidade || '';
            if (!ca !== !cb) return ca ? -1 : 1;
            const c = ca.localeCompare(cb, 'pt-BR');
            if (c !== 0) return c;
            return String(a.numero ?? '').localeCompare(String(b.numero ?? ''), 'pt-BR', { numeric: true });
        });
    }, [pedidosLivres, searchTerm, filtroVendedores, filtroTipo, periodo.de, periodo.ate]);

    // Grupos por cidade (lista já ordenada por cidade)
    const grupos = useMemo(() => {
        if (!agruparCidade) return [{ cidade: null, pedidos: pedidosFiltrados, total: 0 }];
        const map = new Map();
        pedidosFiltrados.forEach(p => {
            const c = p.cliente?.End_Cidade || SEM_CIDADE;
            if (!map.has(c)) map.set(c, []);
            map.get(c).push(p);
        });
        return Array.from(map.entries()).map(([cidade, pedidos]) => ({
            cidade, pedidos, total: pedidos.reduce((s, p) => s + valorNum(p), 0)
        }));
    }, [pedidosFiltrados, agruparCidade]);

    const amostrasFiltradas = useMemo(() => {
        const termo = searchTerm.toLowerCase();
        return amostrasLivres.filter(a => {
            const clienteNome = (a.cliente?.NomeFantasia || a.cliente?.Nome || a.lead?.nomeEstabelecimento || '').toLowerCase();
            const cidade = (a.cliente?.End_Cidade || '').toLowerCase();
            const usuarioNome = (a.solicitadoPor?.nome || '').toLowerCase();

            const strBusca = `${clienteNome} ${String(a.numero || '')} ${cidade} ${usuarioNome}`;
            return termo === '' || strBusca.includes(termo);
        });
    }, [amostrasLivres, searchTerm]);

    const estadoDe = (lista, set) => {
        if (lista.length === 0) return 'nenhum';
        const n = lista.filter(p => set.has(p.id)).length;
        return n === 0 ? 'nenhum' : n === lista.length ? 'todos' : 'parcial';
    };

    const toggleLista = (lista) => {
        const todos = lista.length > 0 && lista.every(p => selecionados.has(p.id));
        const novo = new Set(selecionados);
        lista.forEach(p => { if (todos) novo.delete(p.id); else novo.add(p.id); });
        setSelecionados(novo);
    };

    const toggleTodos = () => {
        if (aba === 'pedidos') {
            toggleLista(pedidosFiltrados);
        } else {
            if (amostrasFiltradas.length > 0 && amostrasFiltradas.every(a => amostrasSelecionadas.has(a.id))) setAmostrasSelecionadas(new Set());
            else setAmostrasSelecionadas(new Set(amostrasFiltradas.map(a => a.id)));
        }
    };

    const handleAtrelar = async () => {
        const temPedidos = selecionados.size > 0;
        const temAmostras = amostrasSelecionadas.size > 0;
        if (!temPedidos && !temAmostras) return toast.error('Selecione ao menos um pedido ou amostra.');
        try {
            setSaving(true);
            const promises = [];
            if (temPedidos) promises.push(embarqueService.inserirPedidos(embarqueId, Array.from(selecionados)));
            if (temAmostras) promises.push(embarqueService.inserirAmostras(embarqueId, Array.from(amostrasSelecionadas)));
            await Promise.all(promises);
            const msgs = [];
            if (temPedidos) msgs.push(`${selecionados.size} pedido${selecionados.size > 1 ? 's' : ''}`);
            if (temAmostras) msgs.push(`${amostrasSelecionadas.size} amostra${amostrasSelecionadas.size > 1 ? 's' : ''}`);
            toast.success(`${msgs.join(' e ')} ${temPedidos ? 'atrelado' : 'atrelada'}${selecionados.size + amostrasSelecionadas.size > 1 ? 's' : ''} à carga!`);
            onSuccess();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao atrelar itens à carga.');
        } finally {
            setSaving(false);
        }
    };

    const nFiltros = (filtroTipo !== 'todos' ? 1 : 0) + (filtroVendedores.length > 0 ? 1 : 0) + (!periodo.padrao ? 1 : 0);
    const limparFiltros = () => {
        setFiltros({ ...filtros, tipo: 'todos', vendedores: [], agruparCidade: true });
        periodoCtl.limpar();
    };
    const totalSelecionados = selecionados.size + amostrasSelecionadas.size;
    const somaSelecionada = useMemo(
        () => pedidosLivres.filter(p => selecionados.has(p.id)).reduce((s, p) => s + valorNum(p), 0),
        [pedidosLivres, selecionados]
    );
    const estadoTodos = aba === 'pedidos'
        ? estadoDe(pedidosFiltrados, selecionados)
        : estadoDe(amostrasFiltradas, amostrasSelecionadas);

    const renderLinhaDesktop = (pedido) => {
        const sel = selecionados.has(pedido.id);
        const rz = razao(pedido);
        const dataEntrega = fmtData(pedido.dataVenda);
        return (
            <tr key={pedido.id} onClick={() => toggleSelecao(pedido.id)}
                className={`cursor-pointer ${sel ? 'bg-mint/40' : 'bg-white hover:bg-gray-50'}`}>
                <td className="pl-4 pr-2 py-2.5 w-8"><Caixa estado={sel ? 'todos' : 'nenhum'} /></td>
                <td className="px-2 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                        <TipoBadge pedido={pedido} />
                        <span className="text-xs font-mono font-bold text-gray-600">#{numeroDe(pedido)}</span>
                    </div>
                </td>
                <td className="px-2 py-2.5 text-sm min-w-0">
                    <div className="font-semibold text-gray-900 leading-tight">{nomeCli(pedido)}</div>
                    {rz && <div className="text-[11px] text-gray-400 leading-tight">{rz}</div>}
                </td>
                <td className="px-2 py-2.5 text-right text-sm whitespace-nowrap"><ValorPedido pedido={pedido} /></td>
                <td className="px-2 py-2.5 text-xs font-semibold text-indigo-600 whitespace-nowrap">{dataEntrega || ''}</td>
                <td className="px-2 py-2.5 text-xs text-gray-400">{pedido.bonificacao ? '' : condicaoDe(pedido)}</td>
                <td className="px-2 py-2.5 pr-4 text-xs text-gray-400">{pedido.vendedor?.nome || ''}</td>
            </tr>
        );
    };

    const renderCardMobile = (pedido) => {
        const sel = selecionados.has(pedido.id);
        const rz = razao(pedido);
        const dm = fmtDiaMes(pedido.dataVenda);
        const cond = pedido.bonificacao ? '' : condicaoDe(pedido);
        const sub = [dm, cond].filter(Boolean).join(' · ');
        return (
            <div key={pedido.id} onClick={() => toggleSelecao(pedido.id)}
                className={`flex items-start gap-3 px-3 py-3 min-h-[44px] cursor-pointer ${sel ? 'bg-mint/40' : 'bg-white'}`}>
                <div className="flex-shrink-0 pt-0.5"><Caixa estado={sel ? 'todos' : 'nenhum'} /></div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <TipoBadge pedido={pedido} />
                        <span className="text-xs font-mono font-bold text-gray-600">#{numeroDe(pedido)}</span>
                        <span className="text-sm font-semibold text-gray-900 truncate">{nomeCli(pedido)}</span>
                    </div>
                    {rz && <div className="text-[11px] text-gray-400 truncate">{rz}</div>}
                    <div className="flex items-center justify-between gap-2 mt-1">
                        <span className="text-xs text-gray-500 min-w-0 truncate">{sub}</span>
                        <span className="text-sm flex-shrink-0"><ValorPedido pedido={pedido} /></span>
                    </div>
                </div>
            </div>
        );
    };

    const CabecalhoCidade = ({ g }) => {
        const est = estadoDe(g.pedidos, selecionados);
        return (
            <div onClick={() => toggleLista(g.pedidos)}
                className="flex items-center gap-3 px-3 md:px-4 py-2 bg-mint text-house cursor-pointer min-h-[44px] md:min-h-0">
                <Caixa estado={est} cor="text-house" />
                <span className="font-extrabold text-sm flex-1 min-w-0 truncate">{g.cidade}</span>
                <span className="text-xs font-semibold flex-shrink-0">
                    {g.pedidos.length} pedido{g.pedidos.length > 1 ? 's' : ''} · {moeda(g.total)}
                </span>
            </div>
        );
    };

    const thCls = 'px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide';

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm px-2 py-4 sm:px-4 sm:py-6">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col">

                {/* Header */}
                <div className="px-4 sm:px-5 py-3.5 border-b border-gray-200 flex items-center justify-between rounded-t-xl">
                    <div className="flex items-center gap-3">
                        <div className="bg-mint p-1.5 rounded-lg">
                            <Package className="h-4 w-4 text-primary" />
                        </div>
                        <h3 className="text-sm font-bold text-gray-900">Embarcar Pedidos e Amostras</h3>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Barra de ação no topo (fica sempre visível; só a lista rola) */}
                <div className="sticky top-0 z-10 bg-house text-white px-4 sm:px-5 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <div className="text-sm flex-1 min-w-0">
                        {totalSelecionados === 0 ? (
                            <span className="text-white/70 text-xs">Nenhum selecionado</span>
                        ) : (
                            <span className="font-semibold">
                                {[
                                    selecionados.size > 0 && `${selecionados.size} pedido${selecionados.size > 1 ? 's' : ''}`,
                                    amostrasSelecionadas.size > 0 && `${amostrasSelecionadas.size} amostra${amostrasSelecionadas.size > 1 ? 's' : ''}`
                                ].filter(Boolean).join(' + ')}{' '}
                                {/* concordância: "1 amostra selecionada", "2 pedidos selecionados" */}
                                {selecionados.size === 0 && amostrasSelecionadas.size === 1 ? 'selecionada'
                                    : selecionados.size === 0 ? 'selecionadas'
                                    : totalSelecionados === 1 ? 'selecionado' : 'selecionados'}
                                {selecionados.size > 0 && ` · ${moeda(somaSelecionada)}`}
                            </span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose}
                            className="flex-1 sm:flex-none px-4 py-2 min-h-[44px] sm:min-h-0 border border-white/60 rounded-full text-sm font-medium text-white hover:bg-white/10 transition-colors">
                            Cancelar
                        </button>
                        <button
                            onClick={handleAtrelar}
                            disabled={saving || totalSelecionados === 0}
                            className="flex-1 sm:flex-none px-4 py-2 min-h-[44px] sm:min-h-0 rounded-full text-sm font-semibold text-white bg-primary hover:bg-primaryDark ring-1 ring-white/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                        >
                            {saving ? 'Atrelando...' : `Atrelar ${totalSelecionados > 0 ? totalSelecionados + ' ' : ''}à carga`}
                        </button>
                    </div>
                </div>

                {/* Abas */}
                <div className="px-4 sm:px-5 pt-3 pb-0 bg-white border-b border-gray-200">
                    <div className="flex gap-4">
                        <button
                            onClick={() => setAba('pedidos')}
                            className={`pb-2.5 text-sm font-semibold border-b-2 transition-colors ${aba === 'pedidos' ? 'border-primary text-primaryDark' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                            Pedidos <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${aba === 'pedidos' ? 'bg-mint text-primaryDark' : 'bg-gray-100 text-gray-500'}`}>{pedidosLivres.length}</span>
                        </button>
                        <button
                            onClick={() => setAba('amostras')}
                            className={`pb-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${aba === 'amostras' ? 'border-orange-500 text-orange-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                            <Package className="h-3.5 w-3.5" />
                            Amostras <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-xs ${aba === 'amostras' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>{amostrasLivres.length}</span>
                        </button>
                    </div>
                </div>

                {/* Filtros — numa linha só */}
                <div className="px-4 sm:px-5 py-3 border-b border-gray-100 bg-white">
                    <div className="flex flex-wrap gap-2 items-center">
                        <div className="relative w-full md:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder={aba === 'pedidos' ? 'Buscar cliente, nº, cidade…' : 'Buscar destinatário ou nº...'}
                                className="block w-full pl-9 pr-3 py-2 border border-gray-300 rounded-full text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        {aba === 'pedidos' && (
                            <>
                                <SelectBusca
                                    value={filtroTipo}
                                    onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}
                                    className="w-full md:w-44"
                                >
                                    <option value="todos">Todos os tipos</option>
                                    <option value="normal">Normal</option>
                                    <option value="especial">ZZ — Especial</option>
                                    <option value="bonificacao">BN — Bonificação</option>
                                </SelectBusca>

                                {vendedoresUnicos.length > 0 && (
                                    <div className="w-full md:w-56">
                                        <MultiSelect
                                            options={vendedoresUnicos}
                                            selected={filtroVendedores}
                                            onChange={(v) => setFiltros({ ...filtros, vendedores: v })}
                                            placeholder="Todos os vendedores"
                                            summary
                                            summaryNoun="vendedor"
                                        />
                                    </div>
                                )}

                                <FiltroPeriodo periodo={periodo} controle={periodoCtl} className="w-full md:w-auto" />

                                <label className={`inline-flex items-center gap-2 px-3 py-2 min-h-[44px] md:min-h-0 rounded-full border text-sm font-medium cursor-pointer select-none ${agruparCidade ? 'bg-mint border-primary text-primaryDark' : 'bg-white border-gray-300 text-gray-600'}`}>
                                    <input type="checkbox" className="accent-primary" checked={agruparCidade}
                                        onChange={(e) => setFiltros({ ...filtros, agruparCidade: e.target.checked })} />
                                    Agrupar por cidade
                                </label>

                                {nFiltros > 0 && (
                                    <button
                                        onClick={limparFiltros}
                                        className="px-3 py-2 min-h-[44px] md:min-h-0 text-xs font-medium text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 rounded-full transition-colors"
                                    >
                                        Limpar ({nFiltros})
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Lista */}
                <div className="flex-1 overflow-y-auto bg-gray-50">
                    {loading ? (
                        <div className="flex items-center justify-center gap-2 py-12 text-gray-400">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                            <span className="text-sm">Carregando…</span>
                        </div>
                    ) : aba === 'pedidos' ? (
                        pedidosFiltrados.length === 0 ? (
                            <div className="text-center py-12 text-gray-400 text-sm">
                                {pedidosLivres.length === 0 ? 'Nenhum pedido disponível.' : 'Nenhum pedido com estes filtros.'}
                            </div>
                        ) : (
                            <>
                                {/* Desktop: tabela */}
                                <div className="hidden md:block">
                                    <table className="min-w-full bg-white">
                                        <thead className="bg-gray-50 border-b border-gray-200">
                                            <tr>
                                                <th className="pl-4 pr-2 py-2 w-8">
                                                    <button onClick={toggleTodos} title={`Selecionar todos (${pedidosFiltrados.length})`} className="flex">
                                                        <Caixa estado={estadoTodos} />
                                                    </button>
                                                </th>
                                                <th className={thCls}>Nº</th>
                                                <th className={thCls}>Cliente</th>
                                                <th className={`${thCls} text-right`}>Valor</th>
                                                <th className={thCls}>Entrega</th>
                                                <th className={thCls}>Cond. pgto</th>
                                                <th className={`${thCls} pr-4`}>Vendedor</th>
                                            </tr>
                                        </thead>
                                        {grupos.map(g => (
                                            <tbody key={g.cidade || 'todos'} className="divide-y divide-gray-100 border-b border-gray-100">
                                                {g.cidade && (
                                                    <tr><td colSpan={7} className="p-0"><CabecalhoCidade g={g} /></td></tr>
                                                )}
                                                {g.pedidos.map(renderLinhaDesktop)}
                                            </tbody>
                                        ))}
                                    </table>
                                </div>

                                {/* Mobile: cards */}
                                <div className="md:hidden">
                                    <div onClick={toggleTodos} className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-100 min-h-[44px] cursor-pointer text-xs font-medium text-gray-600">
                                        <Caixa estado={estadoTodos} />
                                        {estadoTodos === 'todos' ? 'Desmarcar todos' : `Selecionar todos (${pedidosFiltrados.length})`}
                                    </div>
                                    {grupos.map(g => (
                                        <div key={g.cidade || 'todos'}>
                                            {g.cidade && <CabecalhoCidade g={g} />}
                                            <div className="divide-y divide-gray-100">
                                                {g.pedidos.map(renderCardMobile)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )
                    ) : (
                        amostrasFiltradas.length === 0 ? (
                            <div className="text-center py-12 text-gray-400 text-sm">Nenhuma amostra LIBERADA disponível.</div>
                        ) : (
                            <>
                                {/* Desktop: tabela */}
                                <div className="hidden md:block">
                                    <table className="min-w-full bg-white">
                                        <thead className="bg-gray-50 border-b border-gray-200">
                                            <tr>
                                                <th className="pl-4 pr-2 py-2 w-8">
                                                    <button onClick={toggleTodos} title={`Selecionar todas (${amostrasFiltradas.length})`} className="flex">
                                                        <Caixa estado={estadoTodos} cor="text-orange-500" />
                                                    </button>
                                                </th>
                                                <th className={thCls}>Nº</th>
                                                <th className={thCls}>Destinatário</th>
                                                <th className={thCls}>Cidade</th>
                                                <th className={thCls}>Solicitante</th>
                                                <th className={`${thCls} pr-4`}>Itens</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {amostrasFiltradas.map(a => {
                                                const selA = amostrasSelecionadas.has(a.id);
                                                return (
                                                    <tr key={a.id} onClick={() => toggleAmostra(a.id)}
                                                        className={`cursor-pointer ${selA ? 'bg-orange-50' : 'bg-white hover:bg-orange-50/50'}`}>
                                                        <td className="pl-4 pr-2 py-2.5 w-8"><Caixa estado={selA ? 'todos' : 'nenhum'} cor="text-orange-500" /></td>
                                                        <td className="px-2 py-2.5 text-xs font-mono font-bold text-orange-600 whitespace-nowrap">AM#{a.numero}</td>
                                                        <td className="px-2 py-2.5 text-sm font-semibold text-gray-900">
                                                            {a.cliente?.NomeFantasia || a.cliente?.Nome || a.lead?.nomeEstabelecimento || '-'}
                                                        </td>
                                                        <td className="px-2 py-2.5 text-xs text-gray-500">{a.cliente?.End_Cidade || ''}</td>
                                                        <td className="px-2 py-2.5 text-xs text-gray-500">{a.solicitadoPor?.nome || ''}</td>
                                                        <td className="px-2 py-2.5 pr-4 text-xs text-gray-500 whitespace-nowrap">{a.itens?.length || 0} {(a.itens?.length || 0) === 1 ? 'item' : 'itens'}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile: cards */}
                                <div className="md:hidden">
                                    <div onClick={toggleTodos} className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-100 min-h-[44px] cursor-pointer text-xs font-medium text-gray-600">
                                        <Caixa estado={estadoTodos} cor="text-orange-500" />
                                        {estadoTodos === 'todos' ? 'Desmarcar todas' : `Selecionar todas (${amostrasFiltradas.length})`}
                                    </div>
                                    <div className="divide-y divide-gray-100">
                                        {amostrasFiltradas.map((amostra) => {
                                            const selA = amostrasSelecionadas.has(amostra.id);
                                            return (
                                                <div key={amostra.id} onClick={() => toggleAmostra(amostra.id)}
                                                    className={`flex items-start gap-3 px-3 py-3 min-h-[44px] cursor-pointer ${selA ? 'bg-orange-50' : 'bg-white'}`}>
                                                    <div className="flex-shrink-0 pt-0.5"><Caixa estado={selA ? 'todos' : 'nenhum'} cor="text-orange-500" /></div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-mono font-bold text-orange-600">AM#{amostra.numero}</span>
                                                            <span className="text-sm font-semibold text-gray-900 truncate">
                                                                {amostra.cliente?.NomeFantasia || amostra.cliente?.Nome || amostra.lead?.nomeEstabelecimento || '-'}
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                                                            <span className="text-xs text-gray-500">{amostra.itens?.length || 0} itens</span>
                                                            {amostra.solicitadoPor?.nome && (
                                                                <span className="flex items-center gap-1 text-xs text-gray-500">
                                                                    <User className="h-3 w-3" />{amostra.solicitadoPor.nome}
                                                                </span>
                                                            )}
                                                            {amostra.cliente?.End_Cidade && (
                                                                <span className="flex items-center gap-1 text-xs text-gray-500">
                                                                    <MapPin className="h-3 w-3" />{amostra.cliente.End_Cidade}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </>
                        )
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdicionarPedidosModal;
