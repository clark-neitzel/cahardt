import React, { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import { Pencil, BarChart2, CheckCircle, XCircle, AlertCircle, Percent, TrendingUp, MapPin, List, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../../contexts/AuthContext';
import { comissaoService } from '../../../services/comissaoService';
import api from '../../../services/api';
import ConfigModal from './ConfigModal';

dayjs.locale('pt-br');

const STORAGE_KEY = 'gerenciar_comissoes_mes';

const fmt = (v) => `R$ ${Number(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPerc = (v) => `${Number(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;

const GerenciarComissoes = () => {
    const { user } = useAuth();
    const podeGerenciar = !!user?.permissoes?.admin || !!user?.permissoes?.Pode_Gerenciar_Metas;

    const [mes, setMes] = useState(() => localStorage.getItem(STORAGE_KEY) || dayjs().format('YYYY-MM'));
    const [aba, setAba] = useState('config'); // 'config' | 'apuracao'
    const [configs, setConfigs] = useState([]);
    const [apuracao, setApuracao] = useState([]);
    const [metas, setMetas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingApuracao, setLoadingApuracao] = useState(false);
    const [modalAberto, setModalAberto] = useState(false);
    const [editando, setEditando] = useState(null); // { vendedorId, nome, ...config }
    const [detalhe, setDetalhe] = useState(null); // vendedor selecionado na apuração

    const changeMes = (v) => { setMes(v); localStorage.setItem(STORAGE_KEY, v); };

    const carregarConfigs = useCallback(async () => {
        setLoading(true);
        try {
            const [cfgs, metasList] = await Promise.all([
                comissaoService.listarConfigs(mes),
                api.get('/metas', { params: { mesReferencia: mes } }).then(r => r.data)
            ]);
            setConfigs(cfgs);
            setMetas(Array.isArray(metasList) ? metasList : []);
        } catch {
            toast.error('Erro ao carregar configurações');
        } finally {
            setLoading(false);
        }
    }, [mes]);

    const carregarApuracao = useCallback(async () => {
        setLoadingApuracao(true);
        try {
            const data = await comissaoService.apurar(mes);
            setApuracao(Array.isArray(data) ? data : []);
        } catch {
            toast.error('Erro ao calcular apuração');
        } finally {
            setLoadingApuracao(false);
        }
    }, [mes]);

    useEffect(() => { carregarConfigs(); }, [carregarConfigs]);
    useEffect(() => { if (aba === 'apuracao') carregarApuracao(); }, [aba, carregarApuracao]);

    const abrirModal = (vendedorId, nome, configExistente) => {
        const base = {
            percAbaixoMeta: 0, percNaMeta: 0, percAcimaMeta: 0,
            bonusCidades: 0, bonusProdutos: 0, bonusFlex: 0, limiteFlexPerc: 100
        };
        setEditando({ vendedorId, nome, ...(configExistente || base) });
        setModalAberto(true);
    };

    const salvar = async (dados) => {
        try {
            await comissaoService.salvarConfig({ ...dados, mesReferencia: mes });
            toast.success('Configuração salva');
            setModalAberto(false);
            carregarConfigs();
        } catch {
            toast.error('Erro ao salvar');
        }
    };

    // Merge metas + configs para a tabela de configuração
    const linhasConfig = metas.map(m => {
        const cfg = configs.find(c => c.vendedorId === m.vendedorId);
        return { vendedorId: m.vendedorId, nome: m.vendedor?.nome || m.vendedorId, config: cfg || null };
    });

    const apuracaoVendedor = detalhe ? apuracao.find(a => a.vendedorId === detalhe) : null;

    return (
        <div className="p-3 md:p-6 max-w-6xl mx-auto max-w-full overflow-x-hidden">
            {/* Topbar de página */}
            <div className="flex items-center justify-between gap-3 p-3 md:p-6 bg-white border-b border-gray-200 rounded-t-xl">
                <div className="flex items-center gap-2">
                    <div className="bg-amber-100 p-1.5 md:p-2 rounded-lg">
                        <Percent className="h-4 w-4 md:h-5 md:w-5 text-amber-600" />
                    </div>
                    <div>
                        <h1 className="text-base md:text-2xl font-bold text-gray-900">Comissões</h1>
                        <p className="text-xs md:text-sm text-gray-500">
                            {dayjs(mes + '-01').format('MMMM [de] YYYY')}
                        </p>
                    </div>
                </div>
                <input
                    type="month"
                    value={mes}
                    onChange={e => changeMes(e.target.value)}
                    className="w-32 md:w-40 border border-gray-300 rounded px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                />
            </div>

            {/* Abas */}
            <div className="bg-white border-b border-gray-200 px-3 md:px-6">
                <div className="flex gap-1 overflow-x-auto hide-scrollbar">
                    {[
                        { id: 'config', label: 'Configuração' },
                        { id: 'apuracao', label: 'Apuração' }
                    ].map(a => (
                        <button
                            key={a.id}
                            onClick={() => { setAba(a.id); setDetalhe(null); }}
                            className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                                aba === a.id
                                    ? 'border-primary text-primary font-semibold'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {a.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-white rounded-b-xl border-x border-b border-gray-200 shadow-sm mb-6 p-3 md:p-5">

                {/* ---- ABA CONFIGURAÇÃO ---- */}
                {aba === 'config' && (
                    loading ? (
                        <p className="text-gray-400 text-sm py-8 text-center">Carregando...</p>
                    ) : linhasConfig.length === 0 ? (
                        <p className="text-gray-400 text-sm py-8 text-center">
                            Nenhuma meta cadastrada para este mês. Cadastre metas primeiro.
                        </p>
                    ) : (
                        <>
                            {/* Mobile: cards */}
                            <div className="md:hidden space-y-3">
                                {linhasConfig.map(({ vendedorId, nome, config }) => (
                                    <div key={vendedorId} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-semibold text-gray-900">{nome}</span>
                                            {podeGerenciar && (
                                                <button
                                                    onClick={() => abrirModal(vendedorId, nome, config)}
                                                    className="p-2 text-gray-400 hover:text-primary hover:bg-gray-100 rounded"
                                                    title="Editar"
                                                >
                                                    <Pencil size={16} />
                                                </button>
                                            )}
                                        </div>
                                        {config ? (
                                            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                                                <div className="flex justify-between"><span className="text-gray-500">Abaixo</span><span className="font-medium text-gray-700">{fmtPerc(config.percAbaixoMeta)}</span></div>
                                                <div className="flex justify-between"><span className="text-gray-500">Na meta</span><span className="font-medium text-gray-700">{fmtPerc(config.percNaMeta)}</span></div>
                                                <div className="flex justify-between"><span className="text-gray-500">Excedente</span><span className="font-medium text-gray-700">{fmtPerc(config.percAcimaMeta)}</span></div>
                                                <div className="flex justify-between"><span className="text-gray-500">Limite flex</span><span className="font-medium text-gray-500">{fmtPerc(config.limiteFlexPerc)}</span></div>
                                                <div className="flex justify-between"><span className="text-gray-500">Bônus cidades</span><span className="font-medium text-green-700">{fmtPerc(config.bonusCidades)}</span></div>
                                                <div className="flex justify-between"><span className="text-gray-500">Bônus produto</span><span className="font-medium text-green-700">{fmtPerc(config.bonusProdutos)}</span></div>
                                                <div className="flex justify-between"><span className="text-gray-500">Bônus flex</span><span className="font-medium text-green-700">{fmtPerc(config.bonusFlex)}</span></div>
                                            </div>
                                        ) : (
                                            <span className="inline-block px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">sem configuração</span>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Desktop: tabela */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Vendedor</th>
                                            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">% Abaixo</th>
                                            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">% Na Meta</th>
                                            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">% Excedente</th>
                                            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Bônus Cidades</th>
                                            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Bônus/Produto</th>
                                            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Bônus Flex</th>
                                            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Limite Flex</th>
                                            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                        {linhasConfig.map(({ vendedorId, nome, config }) => (
                                            <tr key={vendedorId} className="hover:bg-gray-50">
                                                <td className="px-5 py-3 font-medium text-gray-900">{nome}</td>
                                                {config ? (
                                                    <>
                                                        <td className="px-5 py-3 text-right text-gray-700">{fmtPerc(config.percAbaixoMeta)}</td>
                                                        <td className="px-5 py-3 text-right text-gray-700">{fmtPerc(config.percNaMeta)}</td>
                                                        <td className="px-5 py-3 text-right text-gray-700">{fmtPerc(config.percAcimaMeta)}</td>
                                                        <td className="px-5 py-3 text-right text-green-700">{fmtPerc(config.bonusCidades)}</td>
                                                        <td className="px-5 py-3 text-right text-green-700">{fmtPerc(config.bonusProdutos)}</td>
                                                        <td className="px-5 py-3 text-right text-green-700">{fmtPerc(config.bonusFlex)}</td>
                                                        <td className="px-5 py-3 text-right text-gray-500">{fmtPerc(config.limiteFlexPerc)}</td>
                                                    </>
                                                ) : (
                                                    <td colSpan={7} className="px-5 py-3 text-right">
                                                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">sem configuração</span>
                                                    </td>
                                                )}
                                                {podeGerenciar && (
                                                    <td className="px-5 py-3 text-right">
                                                        <button
                                                            onClick={() => abrirModal(vendedorId, nome, config)}
                                                            className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                                                            title="Editar"
                                                        >
                                                            <Pencil size={15} />
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )
                )}

                {/* ---- ABA APURAÇÃO ---- */}
                {aba === 'apuracao' && !detalhe && (
                    loadingApuracao ? (
                        <p className="text-gray-400 text-sm py-8 text-center">Calculando...</p>
                    ) : apuracao.length === 0 ? (
                        <p className="text-gray-400 text-sm py-8 text-center">
                            Nenhuma meta cadastrada para este mês.
                        </p>
                    ) : (
                        <>
                            {/* Mobile: cards */}
                            <div className="md:hidden space-y-3">
                                {apuracao.map(a => {
                                    if (!a.temMeta) return (
                                        <div key={a.vendedorId} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                                            <div className="flex items-center justify-between">
                                                <span className="font-semibold text-gray-900">{a.vendedor?.nome}</span>
                                                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">sem meta</span>
                                            </div>
                                        </div>
                                    );
                                    if (!a.temConfig) return (
                                        <div key={a.vendedorId} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-semibold text-gray-900">{a.vendedor?.nome}</span>
                                                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">sem config.</span>
                                            </div>
                                            <div className="text-xs text-gray-500">Realizado: {fmt(a.realizado)}</div>
                                        </div>
                                    );

                                    const bonusTotal = (a.calculo?.bonusCidades?.valor || 0)
                                        + (a.calculo?.bonusProdutos?.valor || 0)
                                        + (a.calculo?.bonusFlex?.valor || 0);
                                    const percMeta = a.percRealizado ?? 0;
                                    const percEfetiva = a.realizado > 0
                                        ? (a.calculo?.totalComissao / a.realizado) * 100
                                        : 0;

                                    return (
                                        <div key={a.vendedorId} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="font-semibold text-gray-900">{a.vendedor?.nome}</span>
                                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${percMeta >= 100 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                    {percMeta.toFixed(1)}% da meta
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs mb-2">
                                                <div className="flex justify-between"><span className="text-gray-500">Realizado</span><span className="font-medium text-gray-700">{fmt(a.realizado)}</span></div>
                                                <div className="flex justify-between"><span className="text-gray-500">Base</span><span className="font-medium text-gray-700">{fmt(a.calculo?.comissaoBase)}</span></div>
                                                <div className="flex justify-between"><span className="text-gray-500">Bônus</span><span className="font-medium text-green-700">{fmt(bonusTotal)}</span></div>
                                                <div className="flex justify-between"><span className="text-gray-500">% Efetiva</span><span className="font-semibold text-blue-700">{fmtPerc(percEfetiva)}</span></div>
                                            </div>
                                            <div className="flex items-center justify-between border-t border-gray-100 pt-2">
                                                <span className="font-bold text-gray-900">Total: {fmt(a.calculo?.totalComissao)}</span>
                                                <button
                                                    onClick={() => setDetalhe(a.vendedorId)}
                                                    className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-xs"
                                                >
                                                    Ver detalhes
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Desktop: tabela */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Vendedor</th>
                                            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Realizado</th>
                                            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">% Meta</th>
                                            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Base</th>
                                            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Bônus</th>
                                            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Total R$</th>
                                            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">% Efetiva</th>
                                            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                        {apuracao.map(a => {
                                            if (!a.temMeta) return (
                                                <tr key={a.vendedorId} className="hover:bg-gray-50">
                                                    <td className="px-5 py-3 font-medium text-gray-900">{a.vendedor?.nome}</td>
                                                    <td colSpan={7} className="px-5 py-3">
                                                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">sem meta</span>
                                                    </td>
                                                </tr>
                                            );
                                            if (!a.temConfig) return (
                                                <tr key={a.vendedorId} className="hover:bg-gray-50">
                                                    <td className="px-5 py-3 font-medium text-gray-900">{a.vendedor?.nome}</td>
                                                    <td className="px-5 py-3 text-right text-gray-700">{fmt(a.realizado)}</td>
                                                    <td colSpan={6} className="px-5 py-3 text-right">
                                                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">sem configuração de comissão</span>
                                                    </td>
                                                </tr>
                                            );

                                            const bonusTotal = (a.calculo?.bonusCidades?.valor || 0)
                                                + (a.calculo?.bonusProdutos?.valor || 0)
                                                + (a.calculo?.bonusFlex?.valor || 0);
                                            const percMeta = a.percRealizado ?? 0;
                                            const percEfetiva = a.realizado > 0
                                                ? (a.calculo?.totalComissao / a.realizado) * 100
                                                : 0;

                                            const proj = a.projecao;
                                            const percEfetivaProj = proj?.valorProjetado > 0
                                                ? (proj.comissao.total / proj.valorProjetado) * 100 : 0;

                                            return (
                                                <React.Fragment key={a.vendedorId}>
                                                    {/* Linha atual */}
                                                    <tr className="hover:bg-gray-50">
                                                        <td className="px-5 py-3 font-medium text-gray-900">{a.vendedor?.nome}</td>
                                                        <td className="px-5 py-3 text-right text-gray-700">{fmt(a.realizado)}</td>
                                                        <td className="px-5 py-3 text-right">
                                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${percMeta >= 100 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                                {percMeta.toFixed(1)}%
                                                            </span>
                                                        </td>
                                                        <td className="px-5 py-3 text-right text-gray-600">{fmt(a.calculo?.comissaoBase)}</td>
                                                        <td className="px-5 py-3 text-right text-green-700">{fmt(bonusTotal)}</td>
                                                        <td className="px-5 py-3 text-right font-bold text-gray-900">{fmt(a.calculo?.totalComissao)}</td>
                                                        <td className="px-5 py-3 text-right font-semibold text-blue-700">{fmtPerc(percEfetiva)}</td>
                                                        <td className="px-5 py-3 text-right">
                                                            <button onClick={() => setDetalhe(a.vendedorId)}
                                                                className="p-1.5 text-gray-400 hover:text-primary hover:bg-gray-100 rounded"
                                                                title="Ver detalhes">
                                                                <BarChart2 size={15} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                    {/* Linha de projeção */}
                                                    {proj && proj.diasRestantes > 0 && (
                                                        <tr className="bg-blue-50/40">
                                                            <td className="px-5 py-2 pl-8 text-xs text-blue-500 italic">
                                                                ↗ projeção ({proj.diasPassados}d trabalhados · {proj.diasRestantes}d restantes)
                                                            </td>
                                                            <td className="px-5 py-2 text-right text-xs text-blue-600">{fmt(proj.valorProjetado)}</td>
                                                            <td className={`px-5 py-2 text-right text-xs font-medium ${proj.percMeta >= 100 ? 'text-green-600' : 'text-blue-600'}`}>
                                                                {proj.percMeta.toFixed(1)}%
                                                            </td>
                                                            <td className="px-5 py-2 text-right text-xs text-blue-500">{fmt(proj.comissao.base)}</td>
                                                            <td className="px-5 py-2 text-right text-xs text-green-600">
                                                                {fmt((proj.comissao.bonusCidades || 0) + (proj.comissao.bonusProdutos || 0) + (proj.comissao.bonusFlex || 0))}
                                                            </td>
                                                            <td className="px-5 py-2 text-right text-xs font-bold text-blue-700">{fmt(proj.comissao.total)}</td>
                                                            <td className="px-5 py-2 text-right text-xs text-blue-600">{fmtPerc(percEfetivaProj)}</td>
                                                            <td />
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )
                )}

                {/* ---- DETALHE VENDEDOR (apuração) ---- */}
                {aba === 'apuracao' && detalhe && apuracaoVendedor && (
                    <DetalheApuracao
                        data={apuracaoVendedor}
                        onVoltar={() => setDetalhe(null)}
                        fmt={fmt}
                        fmtPerc={fmtPerc}
                    />
                )}
            </div>

            {/* Modal de configuração */}
            {modalAberto && editando && (
                <ConfigModal
                    dados={editando}
                    onClose={() => setModalAberto(false)}
                    onSalvar={salvar}
                />
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Componente de detalhe da apuração
// ---------------------------------------------------------------------------
const DetalheApuracao = ({ data, onVoltar, fmt, fmtPerc }) => {
    const c = data.calculo;
    const isBonusCidades = c?.bonusCidades?.conquistado;
    const isBonusFlex = c?.bonusFlex?.conquistado;
    const percEfetiva = data.realizado > 0 ? (c?.totalComissao / data.realizado) * 100 : 0;

    // % que cada componente representa sobre o total vendido
    const pv = (v) => data.realizado > 0 ? fmtPerc((v / data.realizado) * 100) : '—';

    const faixaLabel = {
        abaixo: 'abaixo do limite — faixa abaixo',
        na_meta: 'dentro da faixa na meta',
        acima: 'acima do kicker — faixa acima',
    }[c?.faixaAplicada] || c?.faixaAplicada;

    return (
        <div>
            <button onClick={onVoltar} className="text-sm text-primary hover:underline mb-4 flex items-center gap-1">
                <ArrowLeft size={14} /> Voltar
            </button>
            <h2 className="text-lg font-bold text-gray-900 mb-4">{data.vendedor?.nome}</h2>

            {/* Resumo */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <Card label="Realizado" value={fmt(data.realizado)} highlight={data.percRealizado >= 100} />
                <Card label="% da Meta" value={`${(data.percRealizado ?? 0).toFixed(1)}%`} highlight={data.percRealizado >= 100} />
                <Card label="Total Comissão" value={fmt(c?.totalComissao)} highlight />
                <Card label="% Efetiva s/ Vendas" value={fmtPerc(percEfetiva)} highlight />
            </div>

            {/* Detalhamento */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
                <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <List className="h-4 w-4 text-blue-600" />
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Detalhamento</span>
                    </div>
                    <span className="text-xs text-gray-400">R$ valor · % das vendas</span>
                </div>
                <div className="p-5 space-y-2 text-sm">
                    <Row label={`Comissão base (${faixaLabel})`}
                         value={fmt(c?.comissaoBase)}
                         sub={pv(c?.comissaoBase)} />

                    <Row
                        label={<span className="flex items-center gap-1">
                            {isBonusCidades ? <CheckCircle size={14} className="text-green-500" /> : <AlertCircle size={14} className="text-orange-400" />}
                            Bônus cidades — {c?.bonusCidades?.cidadesBatidas}/{c?.bonusCidades?.totalCidades}
                            {' '}({((c?.bonusCidades?.ratio ?? 0) * 100).toFixed(0)}%)
                        </span>}
                        value={fmt(c?.bonusCidades?.valor)}
                        sub={pv(c?.bonusCidades?.valor)}
                        dimmed={c?.bonusCidades?.cidadesBatidas === 0}
                    />

                    <Row
                        label={<span className="flex items-center gap-1">
                            {c?.bonusProdutos?.produtosBatidos > 0 ? <CheckCircle size={14} className="text-green-500" /> : <AlertCircle size={14} className="text-orange-400" />}
                            Bônus produtos — {c?.bonusProdutos?.produtosBatidos}/{c?.bonusProdutos?.totalProdutos}
                            {' '}({((c?.bonusProdutos?.ratio ?? 0) * 100).toFixed(0)}%)
                        </span>}
                        value={fmt(c?.bonusProdutos?.valor)}
                        sub={pv(c?.bonusProdutos?.valor)}
                        dimmed={c?.bonusProdutos?.produtosBatidos === 0}
                    />

                    <Row
                        label={<span className="flex items-center gap-1">
                            {isBonusFlex ? <CheckCircle size={14} className="text-green-500" /> : <XCircle size={14} className="text-gray-400" />}
                            Flex — saldo {fmt(c?.bonusFlex?.saldoFlex)} · uso {(c?.bonusFlex?.percUsado ?? 0).toFixed(1)}% / lim {fmtPerc(c?.bonusFlex?.limite)}
                        </span>}
                        value={fmt(c?.bonusFlex?.valor)}
                        sub={pv(c?.bonusFlex?.valor)}
                        dimmed={!isBonusFlex}
                    />

                    <div className="border-t border-gray-100 pt-2 flex justify-between font-bold text-gray-900 text-base">
                        <span>TOTAL</span>
                        <div className="text-right">
                            <div>{fmt(c?.totalComissao)}</div>
                            <div className="text-sm font-semibold text-blue-700">{fmtPerc(percEfetiva)} das vendas</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Projeção */}
            {data.projecao && data.projecao.diasRestantes > 0 && (
                <div className="bg-white rounded-xl border border-blue-200 shadow-sm mb-6">
                    <div className="flex flex-wrap items-center gap-2 px-5 py-3.5 border-b border-blue-100 bg-blue-50/60 rounded-t-xl">
                        <TrendingUp className="h-4 w-4 text-blue-600" />
                        <span className="text-xs font-bold uppercase tracking-widest text-blue-700">Projeção ao final do mês</span>
                        <span className="md:ml-auto text-xs font-normal text-blue-400 basis-full md:basis-auto">
                            {data.projecao.diasPassados}d trabalhados · {data.projecao.diasRestantes}d restantes · média {fmt(data.projecao.mediaDiaria)}/dia
                        </span>
                    </div>
                    <div className="p-5">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
                            <Card label="Vendas projetadas" value={fmt(data.projecao.valorProjetado)} />
                            <Card label="% da meta proj." value={`${(data.projecao.percMeta ?? 0).toFixed(1)}%`} highlight={data.projecao.percMeta >= 100} />
                            <Card label="Comissão projetada" value={fmt(data.projecao.comissao.total)} highlight />
                        </div>
                        <div className="space-y-1.5 text-sm">
                            <Row label="Base projetada" value={fmt(data.projecao.comissao.base)} />
                            <Row label="Bônus cidades proj." value={fmt(data.projecao.comissao.bonusCidades)} dimmed={!data.projecao.comissao.bonusCidades} />
                            <Row label="Bônus produtos proj." value={fmt(data.projecao.comissao.bonusProdutos)} dimmed={!data.projecao.comissao.bonusProdutos} />
                            <Row label="Bônus flex proj." value={fmt(data.projecao.comissao.bonusFlex)} dimmed={!data.projecao.comissao.bonusFlex} />
                            <div className="border-t border-blue-100 pt-1.5 flex justify-between font-bold text-blue-700">
                                <span>TOTAL PROJETADO</span>
                                <span>{fmt(data.projecao.comissao.total)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Cidades */}
            {data.progressoCidades?.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
                    <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                        <MapPin className="h-4 w-4 text-blue-600" />
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Cidades</span>
                    </div>
                    <div className="p-5 space-y-1">
                        {data.progressoCidades.map(c => (
                            <div key={c.cidade} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100 last:border-0">
                                <span className="flex items-center gap-1.5">
                                    {c.bateu
                                        ? <CheckCircle size={13} className="text-green-500" />
                                        : <AlertCircle size={13} className="text-orange-400" />}
                                    {c.cidade}
                                </span>
                                <span className={c.bateu ? 'text-green-700' : 'text-gray-600'}>
                                    {fmt(c.realizado)} / {fmt(c.meta)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Produtos */}
            {data.progressoProdutos?.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                        <List className="h-4 w-4 text-blue-600" />
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Produtos</span>
                    </div>
                    <div className="p-5 space-y-1">
                        {data.progressoProdutos.map(p => (
                            <div key={p.produtoId} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100 last:border-0">
                                <span className="flex items-center gap-1.5">
                                    {p.bateu
                                        ? <CheckCircle size={13} className="text-green-500" />
                                        : <AlertCircle size={13} className="text-orange-400" />}
                                    {p.nome}
                                </span>
                                <span className={p.bateu ? 'text-green-700' : 'text-gray-600'}>
                                    {Number(p.realizado).toFixed(0)} / {Number(p.meta).toFixed(0)} un.
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const Card = ({ label, value, highlight }) => (
    <div className={`rounded-xl border p-3 ${highlight ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <p className={`font-bold text-base ${highlight ? 'text-blue-700' : 'text-gray-900'}`}>{value}</p>
    </div>
);

const Row = ({ label, value, sub, dimmed }) => (
    <div className={`flex justify-between items-start ${dimmed ? 'text-gray-400' : 'text-gray-700'}`}>
        <span className="flex-1 pr-2">{label}</span>
        <div className="text-right shrink-0">
            <span className="font-medium">{value}</span>
            {sub && <span className="ml-1.5 text-xs text-gray-400">({sub})</span>}
        </div>
    </div>
);

export default GerenciarComissoes;
