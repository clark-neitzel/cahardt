import React, { useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { TrendingDown, TrendingUp, ChevronDown, ChevronUp, Filter, Percent } from 'lucide-react';
import toast from 'react-hot-toast';

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtSinal = (v) => (v >= 0 ? '+' : '') + fmt(v);

export default function RelatorioFlex() {
    const { user } = useAuth();
    const podeVerTodos = user?.permissoes?.admin || user?.permissoes?.pedidos?.clientes === 'todos';

    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const inicioMes = hoje.slice(0, 8) + '01';

    const [dataDe, setDataDe] = useState(inicioMes);
    const [dataAte, setDataAte] = useState(hoje);
    const [loading, setLoading] = useState(false);
    const [vendedores, setVendedores] = useState([]);
    const [expandidoVendedor, setExpandidoVendedor] = useState(null);
    const [expandidoPedido, setExpandidoPedido] = useState(null);
    const [gerado, setGerado] = useState(false);

    const fetchFlex = useCallback(async () => {
        try {
            setLoading(true);
            setExpandidoVendedor(null);
            setExpandidoPedido(null);
            const { data } = await api.get('/pedidos/relatorio-flex', {
                params: { dataDe, dataAte }
            });
            setVendedores(data.vendedores || []);
            setGerado(true);
        } catch {
            toast.error('Erro ao carregar análise de flex.');
        } finally {
            setLoading(false);
        }
    }, [dataDe, dataAte]);

    const totalNegativo = vendedores.reduce((s, v) => s + v.flexNegativo, 0);
    const totalPositivo = vendedores.reduce((s, v) => s + v.flexPositivo, 0);
    const totalLiquido = totalNegativo + totalPositivo;

    return (
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-4xl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
                <Percent className="h-7 w-7 text-violet-600 flex-shrink-0" />
                <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Análise de Flex</h1>
            </div>

            {/* Filtros */}
            <div className="bg-white rounded-lg shadow-sm border p-3 sm:p-4 mb-5">
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label className="text-xs text-gray-500 font-medium">De</label>
                        <input type="date" value={dataDe} onChange={e => setDataDe(e.target.value)}
                            className="block mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900" />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 font-medium">Até</label>
                        <input type="date" value={dataAte} onChange={e => setDataAte(e.target.value)}
                            className="block mt-1 px-3 py-2 text-sm border rounded-md bg-white text-gray-900" />
                    </div>
                    <button
                        onClick={fetchFlex}
                        disabled={loading}
                        className="px-5 py-2 text-sm bg-violet-600 text-white rounded-md font-medium hover:bg-violet-700 disabled:opacity-50"
                    >
                        {loading ? 'Carregando...' : 'Gerar'}
                    </button>
                </div>
            </div>

            {loading && (
                <div className="flex justify-center items-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600 mr-3" />
                    Carregando...
                </div>
            )}

            {!loading && gerado && (
                <>
                    {/* Cards resumo */}
                    <div className="grid grid-cols-3 gap-3 mb-5">
                        <div className="bg-white rounded-lg border p-3 shadow-sm">
                            <div className="flex items-center gap-1.5 mb-1">
                                <TrendingDown className="h-4 w-4 text-red-500" />
                                <span className="text-xs text-gray-500 font-medium">Flex Negativo</span>
                            </div>
                            <p className="text-base sm:text-lg font-bold text-red-600">{fmt(totalNegativo)}</p>
                            <p className="text-[10px] text-gray-400">descontos dados</p>
                        </div>
                        <div className="bg-white rounded-lg border p-3 shadow-sm">
                            <div className="flex items-center gap-1.5 mb-1">
                                <TrendingUp className="h-4 w-4 text-green-500" />
                                <span className="text-xs text-gray-500 font-medium">Flex Positivo</span>
                            </div>
                            <p className="text-base sm:text-lg font-bold text-green-600">+{fmt(totalPositivo)}</p>
                            <p className="text-[10px] text-gray-400">acréscimos gerados</p>
                        </div>
                        <div className="bg-white rounded-lg border p-3 shadow-sm">
                            <div className="flex items-center gap-1.5 mb-1">
                                <Percent className="h-4 w-4 text-violet-500" />
                                <span className="text-xs text-gray-500 font-medium">Saldo Líquido</span>
                            </div>
                            <p className={`text-base sm:text-lg font-bold ${totalLiquido >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {fmtSinal(totalLiquido)}
                            </p>
                            <p className="text-[10px] text-gray-400">resultado final</p>
                        </div>
                    </div>

                    {/* Por vendedor */}
                    {vendedores.length === 0 ? (
                        <p className="text-center text-gray-400 py-10">Nenhum pedido com flex no período.</p>
                    ) : (
                        <div className="space-y-2">
                            {vendedores.map(v => {
                                const isOpen = expandidoVendedor === v.vendedorId;
                                const pctUsado = v.flexMensal > 0 ? Math.abs(v.flexNegativo) / v.flexMensal * 100 : 0;
                                const saldoRestante = v.flexMensal > 0 ? v.flexMensal + v.flexNegativo : null;

                                return (
                                    <div key={v.vendedorId} className="bg-white rounded-lg border shadow-sm overflow-hidden">
                                        {/* Header do vendedor */}
                                        <div
                                            className="px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                                            onClick={() => setExpandidoVendedor(isOpen ? null : v.vendedorId)}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-semibold text-gray-800 text-sm">{v.vendedorNome}</span>
                                                        {v.qtdPedidosNegativo > 0 && (
                                                            <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">
                                                                {v.qtdPedidosNegativo} desc.
                                                            </span>
                                                        )}
                                                        {v.qtdPedidosPositivo > 0 && (
                                                            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                                                                {v.qtdPedidosPositivo} acr.
                                                            </span>
                                                        )}
                                                    </div>
                                                    {v.flexMensal > 0 && (
                                                        <div className="mt-1.5">
                                                            <div className="flex items-center justify-between text-[10px] text-gray-400 mb-0.5">
                                                                <span>Orçamento mensal: R$ {fmt(v.flexMensal)}</span>
                                                                <span>{pctUsado.toFixed(1)}% usado</span>
                                                            </div>
                                                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full transition-all ${pctUsado > 90 ? 'bg-red-500' : pctUsado > 60 ? 'bg-yellow-500' : 'bg-violet-500'}`}
                                                                    style={{ width: `${Math.min(pctUsado, 100)}%` }}
                                                                />
                                                            </div>
                                                            {saldoRestante !== null && (
                                                                <p className={`text-[10px] mt-0.5 ${saldoRestante < 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                                                                    Saldo restante: R$ {fmt(saldoRestante)}
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 flex-shrink-0">
                                                    <div className="text-right">
                                                        {v.flexNegativo !== 0 && (
                                                            <p className="text-xs font-bold text-red-600">{fmt(v.flexNegativo)}</p>
                                                        )}
                                                        {v.flexPositivo !== 0 && (
                                                            <p className="text-xs font-bold text-green-600">+{fmt(v.flexPositivo)}</p>
                                                        )}
                                                        <p className={`text-xs font-bold ${(v.flexNegativo + v.flexPositivo) >= 0 ? 'text-gray-600' : 'text-red-700'}`}>
                                                            liq: {fmtSinal(v.flexNegativo + v.flexPositivo)}
                                                        </p>
                                                    </div>
                                                    {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Pedidos do vendedor */}
                                        {isOpen && (
                                            <div className="border-t border-gray-100 divide-y divide-gray-50">
                                                {v.pedidos.length === 0 ? (
                                                    <p className="text-sm text-gray-400 px-4 py-3">Nenhum pedido com flex no período.</p>
                                                ) : v.pedidos.map(p => {
                                                    const pedIsOpen = expandidoPedido === p.id;
                                                    return (
                                                        <div key={p.id}>
                                                            <div
                                                                className="px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-between gap-3"
                                                                onClick={() => setExpandidoPedido(pedIsOpen ? null : p.id)}
                                                            >
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <span className="text-xs font-medium text-gray-600 flex-shrink-0">
                                                                        {p.especial ? 'ZZ' : '#'}{p.numero || '-'}
                                                                    </span>
                                                                    <span className="text-xs text-gray-500 truncate">{p.clienteNome}</span>
                                                                    <span className="text-[10px] text-gray-400 flex-shrink-0">
                                                                        {new Date(p.createdAt).toLocaleDateString('pt-BR')}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                                    <span className="text-xs text-gray-500">R$ {fmt(p.valorTotal)}</span>
                                                                    <span className={`text-xs font-bold ${p.flexTotal < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                                        {fmtSinal(p.flexTotal)}
                                                                    </span>
                                                                    {pedIsOpen ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
                                                                </div>
                                                            </div>

                                                            {/* Itens do pedido */}
                                                            {pedIsOpen && p.itens && p.itens.length > 0 && (
                                                                <div className="bg-gray-50 px-4 pb-3 pt-1">
                                                                    <table className="w-full text-xs">
                                                                        <thead>
                                                                            <tr className="text-gray-400">
                                                                                <th className="text-left py-1 font-medium">Produto</th>
                                                                                <th className="text-right py-1 font-medium">Qtd</th>
                                                                                <th className="text-right py-1 font-medium">V.Base</th>
                                                                                <th className="text-right py-1 font-medium">V.Prat.</th>
                                                                                <th className="text-right py-1 font-medium">Flex</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {p.itens.map((item, idx) => (
                                                                                <tr key={idx} className="border-t border-gray-200">
                                                                                    <td className="py-1 text-gray-700 pr-2">{item.produtoNome}</td>
                                                                                    <td className="py-1 text-right text-gray-500">{Number(item.quantidade).toFixed(3).replace('.', ',')}</td>
                                                                                    <td className="py-1 text-right text-gray-400">{fmt(item.valorBase)}</td>
                                                                                    <td className="py-1 text-right text-gray-700">{fmt(item.valor)}</td>
                                                                                    <td className={`py-1 text-right font-bold ${item.flexGerado < 0 ? 'text-red-600' : item.flexGerado > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                                                                        {fmtSinal(item.flexGerado)}
                                                                                    </td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                        <tfoot>
                                                                            <tr className="border-t border-gray-300">
                                                                                <td colSpan={3} className="py-1 text-right text-gray-500 font-medium">Total</td>
                                                                                <td className="py-1 text-right font-bold text-gray-700">R$ {fmt(p.valorTotal)}</td>
                                                                                <td className={`py-1 text-right font-bold ${p.flexTotal < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                                                    {fmtSinal(p.flexTotal)}
                                                                                </td>
                                                                            </tr>
                                                                        </tfoot>
                                                                    </table>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {!loading && !gerado && (
                <div className="text-center text-gray-400 py-20">Selecione o período e clique em Gerar.</div>
            )}
        </div>
    );
}
