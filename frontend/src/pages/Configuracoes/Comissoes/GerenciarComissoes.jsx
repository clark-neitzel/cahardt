import React, { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import { Pencil, BarChart2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
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
        <div className="p-4 md:p-6 max-w-6xl mx-auto">
            {/* Cabeçalho */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Comissões</h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {dayjs(mes + '-01').format('MMMM [de] YYYY')}
                    </p>
                </div>
                <input
                    type="month"
                    value={mes}
                    onChange={e => changeMes(e.target.value)}
                    className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            {/* Abas */}
            <div className="flex gap-1 mb-5 border-b">
                {[
                    { id: 'config', label: 'Configuração' },
                    { id: 'apuracao', label: 'Apuração' }
                ].map(a => (
                    <button
                        key={a.id}
                        onClick={() => { setAba(a.id); setDetalhe(null); }}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                            aba === a.id
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        {a.label}
                    </button>
                ))}
            </div>

            {/* ---- ABA CONFIGURAÇÃO ---- */}
            {aba === 'config' && (
                loading ? (
                    <p className="text-gray-400 text-sm py-8 text-center">Carregando...</p>
                ) : linhasConfig.length === 0 ? (
                    <p className="text-gray-400 text-sm py-8 text-center">
                        Nenhuma meta cadastrada para este mês. Cadastre metas primeiro.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-gray-500 uppercase tracking-wide border-b">
                                    <th className="text-left py-2 pr-4 font-medium">Vendedor</th>
                                    <th className="text-right pr-4 font-medium">% Abaixo</th>
                                    <th className="text-right pr-4 font-medium">% Na Meta</th>
                                    <th className="text-right pr-4 font-medium">% Excedente</th>
                                    <th className="text-right pr-4 font-medium">Bônus Cidades</th>
                                    <th className="text-right pr-4 font-medium">Bônus/Produto</th>
                                    <th className="text-right pr-4 font-medium">Bônus Flex</th>
                                    <th className="text-right pr-4 font-medium">Limite Flex</th>
                                    <th className="text-right font-medium">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {linhasConfig.map(({ vendedorId, nome, config }) => (
                                    <tr key={vendedorId} className="border-b hover:bg-gray-50">
                                        <td className="py-3 pr-4 font-medium text-gray-800">{nome}</td>
                                        {config ? (
                                            <>
                                                <td className="text-right pr-4 text-gray-700">{fmtPerc(config.percAbaixoMeta)}</td>
                                                <td className="text-right pr-4 text-gray-700">{fmtPerc(config.percNaMeta)}</td>
                                                <td className="text-right pr-4 text-gray-700">{fmtPerc(config.percAcimaMeta)}</td>
                                                <td className="text-right pr-4 text-green-700">{fmtPerc(config.bonusCidades)}</td>
                                                <td className="text-right pr-4 text-green-700">{fmtPerc(config.bonusProdutos)}</td>
                                                <td className="text-right pr-4 text-green-700">{fmtPerc(config.bonusFlex)}</td>
                                                <td className="text-right pr-4 text-gray-500">{fmtPerc(config.limiteFlexPerc)}</td>
                                            </>
                                        ) : (
                                            <td colSpan={7} className="text-right pr-4 text-gray-400 italic">
                                                sem configuração
                                            </td>
                                        )}
                                        {podeGerenciar && (
                                            <td className="text-right py-2">
                                                <button
                                                    onClick={() => abrirModal(vendedorId, nome, config)}
                                                    className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600 transition-colors"
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
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-gray-500 uppercase tracking-wide border-b">
                                    <th className="text-left py-2 pr-4 font-medium">Vendedor</th>
                                    <th className="text-right pr-4 font-medium">Meta</th>
                                    <th className="text-right pr-4 font-medium">Realizado</th>
                                    <th className="text-right pr-4 font-medium">% Meta</th>
                                    <th className="text-right pr-4 font-medium">Comissão Base</th>
                                    <th className="text-right pr-4 font-medium">Bônus Total</th>
                                    <th className="text-right pr-4 font-medium">Total</th>
                                    <th className="text-right font-medium">Detalhes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {apuracao.map(a => {
                                    if (!a.temMeta) return (
                                        <tr key={a.vendedorId} className="border-b">
                                            <td className="py-3 pr-4 font-medium text-gray-800">{a.vendedor?.nome}</td>
                                            <td colSpan={7} className="text-gray-400 italic pr-4">sem meta</td>
                                        </tr>
                                    );
                                    if (!a.temConfig) return (
                                        <tr key={a.vendedorId} className="border-b">
                                            <td className="py-3 pr-4 font-medium text-gray-800">{a.vendedor?.nome}</td>
                                            <td className="text-right pr-4">{fmt(a.meta)}</td>
                                            <td className="text-right pr-4">{fmt(a.realizado)}</td>
                                            <td colSpan={5} className="text-gray-400 italic pr-4 text-right">
                                                sem configuração de comissão
                                            </td>
                                        </tr>
                                    );

                                    const bonusTotal = (a.calculo?.bonusCidades?.valor || 0)
                                        + (a.calculo?.bonusProdutos?.valor || 0)
                                        + (a.calculo?.bonusFlex?.valor || 0);
                                    const percMeta = a.percRealizado ?? 0;

                                    return (
                                        <tr key={a.vendedorId} className="border-b hover:bg-gray-50">
                                            <td className="py-3 pr-4 font-medium text-gray-800">{a.vendedor?.nome}</td>
                                            <td className="text-right pr-4">{fmt(a.meta)}</td>
                                            <td className="text-right pr-4">{fmt(a.realizado)}</td>
                                            <td className={`text-right pr-4 font-medium ${percMeta >= 100 ? 'text-green-600' : 'text-orange-600'}`}>
                                                {percMeta.toFixed(1)}%
                                            </td>
                                            <td className="text-right pr-4">{fmt(a.calculo?.comissaoBase)}</td>
                                            <td className="text-right pr-4 text-green-700">{fmt(bonusTotal)}</td>
                                            <td className="text-right pr-4 font-bold text-gray-900">{fmt(a.calculo?.totalComissao)}</td>
                                            <td className="text-right">
                                                <button
                                                    onClick={() => setDetalhe(a.vendedorId)}
                                                    className="p-1.5 rounded hover:bg-blue-50 text-gray-500 hover:text-blue-600 transition-colors"
                                                    title="Ver detalhes"
                                                >
                                                    <BarChart2 size={15} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
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

    return (
        <div>
            <button onClick={onVoltar} className="text-sm text-blue-600 hover:underline mb-4 flex items-center gap-1">
                ← Voltar
            </button>
            <h2 className="text-lg font-bold text-gray-900 mb-4">{data.vendedor?.nome}</h2>

            {/* Resumo */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <Card label="Meta" value={fmt(data.meta)} />
                <Card label="Realizado" value={fmt(data.realizado)} highlight={data.percRealizado >= 100} />
                <Card label="% da Meta" value={`${(data.percRealizado ?? 0).toFixed(1)}%`} highlight={data.percRealizado >= 100} />
                <Card label="Total Comissão" value={fmt(c?.totalComissao)} highlight />
            </div>

            {/* Detalhamento */}
            <div className="border rounded-xl p-4 space-y-3 text-sm mb-6">
                <h3 className="font-semibold text-gray-700 mb-2">Detalhamento</h3>

                <Row label={`Comissão base (${data.calculo?.faixaAplicada === 'acima' ? '% na meta + % excedente' : '% abaixo da meta'})`}
                     value={fmt(c?.comissaoBase)} />

                <Row
                    label={<span className="flex items-center gap-1">
                        {isBonusCidades ? <CheckCircle size={14} className="text-green-500" /> : <XCircle size={14} className="text-gray-400" />}
                        Bônus cidades ({c?.bonusCidades?.cidadesBatidas}/{c?.bonusCidades?.totalCidades} cidades)
                    </span>}
                    value={fmt(c?.bonusCidades?.valor)}
                    dimmed={!isBonusCidades}
                />

                <Row
                    label={<span className="flex items-center gap-1">
                        {c?.bonusProdutos?.produtosBatidos > 0 ? <CheckCircle size={14} className="text-green-500" /> : <XCircle size={14} className="text-gray-400" />}
                        Bônus produtos ({c?.bonusProdutos?.produtosBatidos}/{c?.bonusProdutos?.totalProdutos} produtos)
                    </span>}
                    value={fmt(c?.bonusProdutos?.valor)}
                    dimmed={c?.bonusProdutos?.produtosBatidos === 0}
                />

                <Row
                    label={<span className="flex items-center gap-1">
                        {isBonusFlex ? <CheckCircle size={14} className="text-green-500" /> : <XCircle size={14} className="text-gray-400" />}
                        Flex — saldo {fmt(c?.bonusFlex?.saldoFlex)} (uso: {(c?.bonusFlex?.percUsado ?? 0).toFixed(1)}% / limite {fmtPerc(c?.bonusFlex?.limite)})
                    </span>}
                    value={fmt(c?.bonusFlex?.valor)}
                    dimmed={!isBonusFlex}
                />

                <div className="border-t pt-2 flex justify-between font-bold text-gray-900">
                    <span>TOTAL</span>
                    <span>{fmt(c?.totalComissao)}</span>
                </div>
            </div>

            {/* Cidades */}
            {data.progressoCidades?.length > 0 && (
                <div className="mb-6">
                    <h3 className="font-semibold text-gray-700 text-sm mb-2">Cidades</h3>
                    <div className="space-y-1">
                        {data.progressoCidades.map(c => (
                            <div key={c.cidade} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
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
                <div>
                    <h3 className="font-semibold text-gray-700 text-sm mb-2">Produtos</h3>
                    <div className="space-y-1">
                        {data.progressoProdutos.map(p => (
                            <div key={p.produtoId} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
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
    <div className={`rounded-xl border p-3 ${highlight ? 'bg-blue-50 border-blue-200' : 'bg-gray-50'}`}>
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <p className={`font-bold text-base ${highlight ? 'text-blue-700' : 'text-gray-900'}`}>{value}</p>
    </div>
);

const Row = ({ label, value, dimmed }) => (
    <div className={`flex justify-between ${dimmed ? 'text-gray-400' : 'text-gray-700'}`}>
        <span>{label}</span>
        <span className="font-medium">{value}</span>
    </div>
);

export default GerenciarComissoes;
