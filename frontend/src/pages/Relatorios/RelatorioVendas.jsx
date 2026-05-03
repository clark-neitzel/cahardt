import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import {
    BarChart2, Filter, Download, Users, User, CreditCard, MapPin, Map
} from 'lucide-react';
import toast from 'react-hot-toast';

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtN = (v) => Number(v || 0).toLocaleString('pt-BR');

const TABS = [
    { id: 'vendedor', label: 'Vendedor', icon: User },
    { id: 'cliente',  label: 'Cliente',  icon: Users },
    { id: 'condicao', label: 'Cond. Pagamento', icon: CreditCard },
    { id: 'cidade',   label: 'Cidade',   icon: MapPin },
    { id: 'bairro',   label: 'Bairro',   icon: Map },
];

const MiniBar = ({ valor, max }) => {
    const pct = max > 0 ? Math.max(2, (valor / max) * 100) : 0;
    return (
        <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
            <div className="bg-indigo-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
        </div>
    );
};

const STORAGE_KEY = 'relatorio-vendas-filtros';

const carregarFiltrosSalvos = () => {
    try {
        const salvo = localStorage.getItem(STORAGE_KEY);
        return salvo ? JSON.parse(salvo) : {};
    } catch {
        return {};
    }
};

const RelatorioVendas = () => {
    const { user } = useAuth();

    const [dados, setDados] = useState(null);
    const [loading, setLoading] = useState(false);
    const [showFiltros, setShowFiltros] = useState(true);
    const [activeTab, setActiveTab] = useState('vendedor');
    const [vendedores, setVendedores] = useState([]);

    const saved = carregarFiltrosSalvos();

    const [dataCriacaoDe, setDataCriacaoDe] = useState(saved.dataCriacaoDe ?? '');
    const [dataCriacaoAte, setDataCriacaoAte] = useState(saved.dataCriacaoAte ?? '');
    const [dataVendaDe, setDataVendaDe] = useState(saved.dataVendaDe ?? '');
    const [dataVendaAte, setDataVendaAte] = useState(saved.dataVendaAte ?? '');
    const [vendedorId, setVendedorId] = useState(saved.vendedorId ?? '');
    const [situacaoCA, setSituacaoCA] = useState(saved.situacaoCA ?? 'FATURADO');
    const [excluirBonificacao, setExcluirBonificacao] = useState(saved.excluirBonificacao ?? 'true');

    const podeVerTodos = user?.permissoes?.admin || user?.permissoes?.pedidos?.clientes === 'todos';

    useEffect(() => {
        if (podeVerTodos) {
            api.get('/vendedores').then(r => setVendedores(r.data || [])).catch(() => {});
        }
    }, [podeVerTodos]);

    useEffect(() => {
        const filtros = { dataCriacaoDe, dataCriacaoAte, dataVendaDe, dataVendaAte, vendedorId, situacaoCA, excluirBonificacao };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtros));
    }, [dataCriacaoDe, dataCriacaoAte, dataVendaDe, dataVendaAte, vendedorId, situacaoCA, excluirBonificacao]);

    const fetchRelatorio = useCallback(async () => {
        try {
            setLoading(true);
            const params = {};
            if (dataCriacaoDe) params.dataCriacaoDe = dataCriacaoDe;
            if (dataCriacaoAte) params.dataCriacaoAte = dataCriacaoAte;
            if (dataVendaDe) params.dataVendaDe = dataVendaDe;
            if (dataVendaAte) params.dataVendaAte = dataVendaAte;
            if (vendedorId) params.vendedorId = vendedorId;
            if (situacaoCA) params.situacaoCA = situacaoCA;
            if (excluirBonificacao) params.excluirBonificacao = excluirBonificacao;

            const { data } = await api.get('/pedidos/relatorio-vendas', { params });
            setDados(data);
            setShowFiltros(false);
        } catch {
            toast.error('Erro ao gerar relatório de vendas.');
        } finally {
            setLoading(false);
        }
    }, [dataCriacaoDe, dataCriacaoAte, dataVendaDe, dataVendaAte, vendedorId, situacaoCA, excluirBonificacao]);

    const exportarCSV = () => {
        if (!dados) return;

        const tabData = {
            vendedor: {
                headers: ['Vendedor', 'Pedidos', 'Valor Total (R$)', 'Ticket Médio (R$)'],
                rows: dados.porVendedor.map(e => [
                    `"${e.vendedorNome}"`, e.totalPedidos,
                    Number(e.valorTotal).toFixed(2).replace('.', ','),
                    Number(e.ticketMedio).toFixed(2).replace('.', ',')
                ])
            },
            cliente: {
                headers: ['Cliente', 'Cidade', 'Bairro', 'Vendedor', 'Pedidos', 'Valor Total (R$)', 'Ticket Médio (R$)'],
                rows: dados.porCliente.map(e => [
                    `"${e.clienteNome}"`, `"${e.cidade}"`, `"${e.bairro}"`, `"${e.vendedorNome}"`,
                    e.totalPedidos,
                    Number(e.valorTotal).toFixed(2).replace('.', ','),
                    Number(e.ticketMedio).toFixed(2).replace('.', ',')
                ])
            },
            condicao: {
                headers: ['Condição de Pagamento', 'Pedidos', 'Valor Total (R$)', 'Ticket Médio (R$)'],
                rows: dados.porCondicao.map(e => [
                    `"${e.condicao}"`, e.totalPedidos,
                    Number(e.valorTotal).toFixed(2).replace('.', ','),
                    Number(e.ticketMedio).toFixed(2).replace('.', ',')
                ])
            },
            cidade: {
                headers: ['Cidade', 'Clientes', 'Pedidos', 'Valor Total (R$)', 'Ticket Médio (R$)'],
                rows: dados.porCidade.map(e => [
                    `"${e.cidade}"`, e.qtdClientes, e.totalPedidos,
                    Number(e.valorTotal).toFixed(2).replace('.', ','),
                    Number(e.ticketMedio).toFixed(2).replace('.', ',')
                ])
            },
            bairro: {
                headers: ['Cidade', 'Bairro', 'Clientes', 'Pedidos', 'Valor Total (R$)', 'Ticket Médio (R$)'],
                rows: dados.porBairro.map(e => [
                    `"${e.cidade}"`, `"${e.bairro}"`, e.qtdClientes, e.totalPedidos,
                    Number(e.valorTotal).toFixed(2).replace('.', ','),
                    Number(e.ticketMedio).toFixed(2).replace('.', ',')
                ])
            }
        };

        const { headers, rows } = tabData[activeTab];
        const BOM = '﻿';
        const csv = BOM + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `relatorio-vendas-${activeTab}-${dataCriacaoDe || 'inicio'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('CSV exportado!');
    };

    const limpar = () => {
        setDataCriacaoDe(''); setDataCriacaoAte('');
        setDataVendaDe(''); setDataVendaAte('');
        setVendedorId(''); setSituacaoCA('FATURADO'); setExcluirBonificacao('true');
        localStorage.removeItem(STORAGE_KEY);
    };

    const maxVendedor = dados ? Math.max(...dados.porVendedor.map(e => e.valorTotal), 1) : 1;
    const maxCliente  = dados ? Math.max(...dados.porCliente.map(e => e.valorTotal), 1) : 1;
    const maxCondicao = dados ? Math.max(...dados.porCondicao.map(e => e.valorTotal), 1) : 1;
    const maxCidade   = dados ? Math.max(...dados.porCidade.map(e => e.valorTotal), 1) : 1;
    const maxBairro   = dados ? Math.max(...dados.porBairro.map(e => e.valorTotal), 1) : 1;

    return (
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-5xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 sm:mb-6">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <BarChart2 className="h-6 w-6 sm:h-7 sm:w-7 text-indigo-600 flex-shrink-0" />
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-800 truncate">Relatório de Vendas</h1>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {dados && (
                        <button onClick={exportarCSV}
                            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 font-medium">
                            <Download className="h-4 w-4" />
                            <span className="hidden sm:inline">CSV</span>
                        </button>
                    )}
                    <button onClick={() => setShowFiltros(!showFiltros)}
                        className="flex items-center gap-1.5 px-2.5 py-2 text-sm bg-white border rounded-md hover:bg-gray-50">
                        <Filter className="h-4 w-4" />
                        <span className="hidden sm:inline">Filtros</span>
                    </button>
                </div>
            </div>

            {/* Filtros */}
            {showFiltros && (
                <div className="bg-white rounded-lg shadow-sm border p-3 sm:p-4 mb-4 sm:mb-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div>
                            <label className="text-xs text-gray-500 font-medium">Data Criação - De</label>
                            <input type="date" value={dataCriacaoDe} onChange={e => setDataCriacaoDe(e.target.value)}
                                className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900" />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 font-medium">Data Criação - Até</label>
                            <input type="date" value={dataCriacaoAte} onChange={e => setDataCriacaoAte(e.target.value)}
                                className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900" />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 font-medium">Data Venda - De</label>
                            <input type="date" value={dataVendaDe} onChange={e => setDataVendaDe(e.target.value)}
                                className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900" />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 font-medium">Data Venda - Até</label>
                            <input type="date" value={dataVendaAte} onChange={e => setDataVendaAte(e.target.value)}
                                className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900" />
                        </div>
                        {podeVerTodos && (
                            <div>
                                <label className="text-xs text-gray-500 font-medium">Vendedor</label>
                                <select value={vendedorId} onChange={e => setVendedorId(e.target.value)}
                                    className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900">
                                    <option value="">Todos</option>
                                    {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                                </select>
                            </div>
                        )}
                        <div>
                            <label className="text-xs text-gray-500 font-medium">Situação CA</label>
                            <select value={situacaoCA} onChange={e => setSituacaoCA(e.target.value)}
                                className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900">
                                <option value="">Todas</option>
                                <option value="FATURADO">Faturado</option>
                                <option value="APROVADO">Aprovado</option>
                                <option value="EM_ABERTO">Em Aberto</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 font-medium">Bonificações</label>
                            <select value={excluirBonificacao} onChange={e => setExcluirBonificacao(e.target.value)}
                                className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900">
                                <option value="true">Excluir bonificações</option>
                                <option value="false">Incluir tudo</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                        <button onClick={limpar}
                            className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5">
                            Limpar
                        </button>
                        <button onClick={fetchRelatorio} disabled={loading}
                            className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-md font-medium hover:bg-indigo-700 disabled:opacity-50">
                            {loading ? 'Gerando...' : 'Gerar Relatório'}
                        </button>
                    </div>
                </div>
            )}

            {/* Cards resumo */}
            {dados && (
                <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-6">
                    <div className="bg-white rounded-lg shadow-sm border p-3">
                        <p className="text-[10px] sm:text-xs text-gray-500 font-medium">Pedidos</p>
                        <p className="text-lg sm:text-xl font-bold text-gray-900">{fmtN(dados.resumo.totalPedidos)}</p>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm border p-3">
                        <p className="text-[10px] sm:text-xs text-gray-500 font-medium">Valor Total</p>
                        <p className="text-base sm:text-xl font-bold text-gray-900">R$ {fmt(dados.resumo.valorTotalGeral)}</p>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm border p-3">
                        <p className="text-[10px] sm:text-xs text-gray-500 font-medium">Ticket Médio</p>
                        <p className="text-base sm:text-xl font-bold text-gray-900">R$ {fmt(dados.resumo.ticketMedio)}</p>
                    </div>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="flex justify-center items-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mr-3" />
                    Gerando relatório...
                </div>
            )}

            {/* Vazio */}
            {!loading && !dados && (
                <div className="text-center text-gray-400 py-20">
                    Configure os filtros e clique em "Gerar Relatório".
                </div>
            )}

            {/* Tabs + Tabelas */}
            {!loading && dados && (
                <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                    {/* Tab bar */}
                    <div className="flex overflow-x-auto border-b">
                        {TABS.map(tab => {
                            const Icon = tab.icon;
                            const active = activeTab === tab.id;
                            return (
                                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                                        active ? 'border-indigo-600 text-indigo-700 bg-indigo-50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                    }`}>
                                    <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Tab: Vendedor */}
                    {activeTab === 'vendedor' && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Vendedor</th>
                                        <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Pedidos</th>
                                        <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Valor Total</th>
                                        <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Ticket Médio</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {dados.porVendedor.map((e, i) => (
                                        <tr key={i} className="hover:bg-gray-50">
                                            <td className="px-4 py-3">
                                                <p className="font-medium text-gray-900">{e.vendedorNome}</p>
                                                <MiniBar valor={e.valorTotal} max={maxVendedor} />
                                            </td>
                                            <td className="px-4 py-3 text-right text-gray-700">{fmtN(e.totalPedidos)}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-gray-900">R$ {fmt(e.valorTotal)}</td>
                                            <td className="px-4 py-3 text-right text-gray-600">R$ {fmt(e.ticketMedio)}</td>
                                        </tr>
                                    ))}
                                    {dados.porVendedor.length === 0 && (
                                        <tr><td colSpan={4} className="text-center text-gray-400 py-8">Nenhum dado.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Tab: Cliente */}
                    {activeTab === 'cliente' && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Cliente</th>
                                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Cidade / Bairro</th>
                                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Vendedor</th>
                                        <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Pedidos</th>
                                        <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Valor Total</th>
                                        <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Ticket Médio</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {dados.porCliente.map((e, i) => (
                                        <tr key={i} className="hover:bg-gray-50">
                                            <td className="px-4 py-3">
                                                <p className="font-medium text-gray-900 truncate max-w-[160px] sm:max-w-none">{e.clienteNome}</p>
                                                <MiniBar valor={e.valorTotal} max={maxCliente} />
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell">
                                                <p>{e.cidade}</p>
                                                <p className="text-gray-400">{e.bairro}</p>
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">{e.vendedorNome}</td>
                                            <td className="px-4 py-3 text-right text-gray-700">{fmtN(e.totalPedidos)}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-gray-900">R$ {fmt(e.valorTotal)}</td>
                                            <td className="px-4 py-3 text-right text-gray-600 hidden sm:table-cell">R$ {fmt(e.ticketMedio)}</td>
                                        </tr>
                                    ))}
                                    {dados.porCliente.length === 0 && (
                                        <tr><td colSpan={6} className="text-center text-gray-400 py-8">Nenhum dado.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Tab: Condição de Pagamento */}
                    {activeTab === 'condicao' && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Condição de Pagamento</th>
                                        <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Pedidos</th>
                                        <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Valor Total</th>
                                        <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Ticket Médio</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {dados.porCondicao.map((e, i) => (
                                        <tr key={i} className="hover:bg-gray-50">
                                            <td className="px-4 py-3">
                                                <p className="font-medium text-gray-900">{e.condicao}</p>
                                                <MiniBar valor={e.valorTotal} max={maxCondicao} />
                                            </td>
                                            <td className="px-4 py-3 text-right text-gray-700">{fmtN(e.totalPedidos)}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-gray-900">R$ {fmt(e.valorTotal)}</td>
                                            <td className="px-4 py-3 text-right text-gray-600 hidden sm:table-cell">R$ {fmt(e.ticketMedio)}</td>
                                        </tr>
                                    ))}
                                    {dados.porCondicao.length === 0 && (
                                        <tr><td colSpan={4} className="text-center text-gray-400 py-8">Nenhum dado.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Tab: Cidade */}
                    {activeTab === 'cidade' && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Cidade</th>
                                        <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Clientes</th>
                                        <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Pedidos</th>
                                        <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Valor Total</th>
                                        <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Ticket Médio</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {dados.porCidade.map((e, i) => (
                                        <tr key={i} className="hover:bg-gray-50">
                                            <td className="px-4 py-3">
                                                <p className="font-medium text-gray-900">{e.cidade}</p>
                                                <MiniBar valor={e.valorTotal} max={maxCidade} />
                                            </td>
                                            <td className="px-4 py-3 text-right text-gray-500">{fmtN(e.qtdClientes)}</td>
                                            <td className="px-4 py-3 text-right text-gray-700">{fmtN(e.totalPedidos)}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-gray-900">R$ {fmt(e.valorTotal)}</td>
                                            <td className="px-4 py-3 text-right text-gray-600 hidden sm:table-cell">R$ {fmt(e.ticketMedio)}</td>
                                        </tr>
                                    ))}
                                    {dados.porCidade.length === 0 && (
                                        <tr><td colSpan={5} className="text-center text-gray-400 py-8">Nenhum dado.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Tab: Bairro */}
                    {activeTab === 'bairro' && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Bairro</th>
                                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Cidade</th>
                                        <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Clientes</th>
                                        <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Pedidos</th>
                                        <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Valor Total</th>
                                        <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Ticket Médio</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {dados.porBairro.map((e, i) => (
                                        <tr key={i} className="hover:bg-gray-50">
                                            <td className="px-4 py-3">
                                                <p className="font-medium text-gray-900">{e.bairro}</p>
                                                <p className="text-xs text-gray-400 sm:hidden">{e.cidade}</p>
                                                <MiniBar valor={e.valorTotal} max={maxBairro} />
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell">{e.cidade}</td>
                                            <td className="px-4 py-3 text-right text-gray-500">{fmtN(e.qtdClientes)}</td>
                                            <td className="px-4 py-3 text-right text-gray-700">{fmtN(e.totalPedidos)}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-gray-900">R$ {fmt(e.valorTotal)}</td>
                                            <td className="px-4 py-3 text-right text-gray-600 hidden sm:table-cell">R$ {fmt(e.ticketMedio)}</td>
                                        </tr>
                                    ))}
                                    {dados.porBairro.length === 0 && (
                                        <tr><td colSpan={6} className="text-center text-gray-400 py-8">Nenhum dado.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default RelatorioVendas;
