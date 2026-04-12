import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Copy, Calculator, Trash2, History, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import pcpReceitaService from '../../services/pcpReceitaService';
import SimuladorEscalonamento from './SimuladorEscalonamento';

const STATUS_CORES = {
    ativa: 'bg-green-100 text-green-800',
    inativa: 'bg-gray-100 text-gray-600',
    rascunho: 'bg-yellow-100 text-yellow-800',
};

const TIPO_CORES = {
    MP: 'bg-amber-100 text-amber-800',
    SUB: 'bg-purple-100 text-purple-800',
    PA: 'bg-green-100 text-green-800',
    EMB: 'bg-blue-100 text-blue-800',
};

export default function ReceitaDetalhe() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [receita, setReceita] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showSimulador, setShowSimulador] = useState(false);
    const [historico, setHistorico] = useState([]);
    const [logs, setLogs] = useState([]);
    const [showHistorico, setShowHistorico] = useState(false);

    useEffect(() => {
        setLoading(true);
        pcpReceitaService.buscarPorId(id)
            .then(async (r) => {
                setReceita(r);
                if (r?.itemPcpId) {
                    try {
                        const [h, l] = await Promise.all([
                            pcpReceitaService.historico(r.itemPcpId),
                            pcpReceitaService.logs(id)
                        ]);
                        setHistorico(h);
                        setLogs(l);
                    } catch { /* silencioso */ }
                }
            })
            .catch(() => toast.error('Erro ao carregar receita'))
            .finally(() => setLoading(false));
    }, [id]);

    const excluirReceita = async () => {
        if (!confirm('Excluir esta receita? Essa acao nao pode ser desfeita.')) return;
        try {
            await pcpReceitaService.excluir(id);
            toast.success('Receita excluida');
            navigate('/pcp/receitas');
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        }
    };

    const clonarReceita = async () => {
        const nome = prompt('Nome da nova receita (será criado um novo subproduto):', receita?.nome ? `${receita.nome} - copia` : '');
        if (!nome?.trim()) return;
        try {
            const nova = await pcpReceitaService.clonar(id, nome.trim());
            toast.success('Receita clonada');
            navigate(`/pcp/receitas/${nova.id}/editar`);
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        }
    };

    if (loading) return <div className="text-center py-12 text-gray-400">Carregando...</div>;
    if (!receita) return <div className="text-center py-12 text-gray-500">Receita nao encontrada</div>;

    return (
        <div className="max-w-4xl mx-auto px-4 py-6">
            <button onClick={() => navigate('/pcp/receitas')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
                <ArrowLeft className="h-4 w-4" /> Voltar
            </button>

            {/* Cabecalho */}
            <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-xl font-bold text-gray-800">{receita.nome}</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            Produz: <span className="font-medium">{receita.itemPcp?.nome}</span> ({receita.itemPcp?.tipo})
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-400">v{receita.versao}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CORES[receita.status]}`}>
                            {receita.status}
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100">
                    <div>
                        <p className="text-xs text-gray-400">Rendimento Base</p>
                        <p className="text-lg font-semibold text-gray-800">
                            {parseFloat(receita.rendimentoBase).toFixed(3)} {receita.itemPcp?.unidade}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400">Perda Padrao</p>
                        <p className="text-lg font-semibold text-gray-800">
                            {receita.perdaPercentual ? `${parseFloat(receita.perdaPercentual).toFixed(2)}%` : '—'}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400">Vigencia</p>
                        <p className="text-sm text-gray-600">
                            {receita.dataInicioVigencia ? new Date(receita.dataInicioVigencia).toLocaleDateString('pt-BR') : '—'}
                            {receita.dataFimVigencia && ` ate ${new Date(receita.dataFimVigencia).toLocaleDateString('pt-BR')}`}
                        </p>
                    </div>
                </div>

                {receita.observacoes && (
                    <p className="text-sm text-gray-500 mt-3 pt-3 border-t border-gray-100">{receita.observacoes}</p>
                )}

                {/* Acoes */}
                <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
                    {receita.status !== 'inativa' && (
                        <button
                            onClick={() => navigate(`/pcp/receitas/${id}/editar`)}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                        >
                            <Pencil className="h-3.5 w-3.5" /> Editar
                        </button>
                    )}
                    <button
                        onClick={() => setShowHistorico(!showHistorico)}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200"
                    >
                        <History className="h-3.5 w-3.5" /> Histórico ({historico.length})
                    </button>
                    <button
                        onClick={clonarReceita}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200"
                    >
                        <Copy className="h-3.5 w-3.5" /> Clonar Receita
                    </button>
                    <button
                        onClick={() => setShowSimulador(!showSimulador)}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                    >
                        <Calculator className="h-3.5 w-3.5" /> Simular Escalonamento
                    </button>
                    <button
                        onClick={excluirReceita}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 ml-auto"
                    >
                        <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </button>
                </div>
            </div>

            {/* Histórico de versões */}
            {showHistorico && (
                <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
                    <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">Versões desta receita</h2>
                    <div className="space-y-2">
                        {historico.map(v => (
                            <button
                                key={v.id}
                                onClick={() => navigate(`/pcp/receitas/${v.id}`)}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded border text-sm text-left transition-colors ${v.id === id ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className="font-semibold text-gray-700">v{v.versao}</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_CORES[v.status]}`}>{v.status}</span>
                                    {v.logs?.[0] && (
                                        <span className="text-xs text-gray-500 truncate max-w-sm">
                                            {v.logs[0].alteradoPorNome || 'sistema'} · {new Date(v.logs[0].alteradoEm).toLocaleDateString('pt-BR')} · {v.logs[0].motivo}
                                        </span>
                                    )}
                                    {!v.logs?.[0] && (
                                        <span className="text-xs text-gray-400">
                                            {v.dataInicioVigencia ? new Date(v.dataInicioVigencia).toLocaleDateString('pt-BR') : '—'} · versão inicial
                                        </span>
                                    )}
                                </div>
                                <ChevronRight className="h-4 w-4 text-gray-400" />
                            </button>
                        ))}
                    </div>

                    {logs.length > 0 && (
                        <div className="mt-5 pt-4 border-t border-gray-100">
                            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Alterações nesta versão (v{receita.versao})</h3>
                            {logs.map(log => (
                                <div key={log.id} className="bg-gray-50 rounded p-3 text-sm">
                                    <div className="flex justify-between text-xs text-gray-500 mb-2">
                                        <span><strong>{log.alteradoPorNome || 'sistema'}</strong> em {new Date(log.alteradoEm).toLocaleString('pt-BR')}</span>
                                    </div>
                                    <p className="text-gray-800 mb-2"><strong>Motivo:</strong> {log.motivo}</p>
                                    {log.alteracoes?.campos && Object.keys(log.alteracoes.campos).length > 0 && (
                                        <div className="mb-2">
                                            <p className="text-xs font-medium text-gray-600">Campos alterados:</p>
                                            <ul className="text-xs text-gray-700 ml-4 list-disc">
                                                {Object.entries(log.alteracoes.campos).map(([k, v]) => (
                                                    <li key={k}>{k}: <span className="line-through text-gray-400">{String(v.de ?? '—')}</span> → <span className="text-gray-800 font-medium">{String(v.para ?? '—')}</span></li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {log.alteracoes?.ingredientes?.adicionados?.length > 0 && (
                                        <div className="mb-1">
                                            <p className="text-xs font-medium text-green-700">+ Adicionados:</p>
                                            <ul className="text-xs text-gray-700 ml-4 list-disc">
                                                {log.alteracoes.ingredientes.adicionados.map((i, idx) => <li key={idx}>{i.nome || i.itemPcpId} — {i.quantidade} ({i.tipo})</li>)}
                                            </ul>
                                        </div>
                                    )}
                                    {log.alteracoes?.ingredientes?.removidos?.length > 0 && (
                                        <div className="mb-1">
                                            <p className="text-xs font-medium text-red-700">− Removidos:</p>
                                            <ul className="text-xs text-gray-700 ml-4 list-disc">
                                                {log.alteracoes.ingredientes.removidos.map((i, idx) => <li key={idx}>{i.nome || i.itemPcpId} — {i.quantidade} ({i.tipo})</li>)}
                                            </ul>
                                        </div>
                                    )}
                                    {log.alteracoes?.ingredientes?.alterados?.length > 0 && (
                                        <div className="mb-1">
                                            <p className="text-xs font-medium text-amber-700">~ Alterados:</p>
                                            <ul className="text-xs text-gray-700 ml-4 list-disc">
                                                {log.alteracoes.ingredientes.alterados.map((i, idx) => (
                                                    <li key={idx}>{i.nome || i.itemPcpId}: qtd {i.quantidade.de} → {i.quantidade.para}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Simulador */}
            {showSimulador && (
                <div className="mb-4">
                    <SimuladorEscalonamento receitaId={id} itensReceita={receita.itens} />
                </div>
            )}

            {/* Componentes */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
                    Componentes ({receita.itens?.length || 0})
                </h2>

                <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Item</th>
                            <th className="text-center px-3 py-2 font-medium text-gray-600">Tipo</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-600">Quantidade</th>
                            <th className="text-center px-3 py-2 font-medium text-gray-600">Unidade</th>
                            <th className="text-center px-3 py-2 font-medium text-gray-600">Etapa</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {receita.itens?.map(item => (
                            <tr key={item.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2">
                                    <span className="font-medium">{item.itemPcp?.nome}</span>
                                    <span className="ml-2 text-xs text-gray-400">{item.itemPcp?.codigo}</span>
                                </td>
                                <td className="px-3 py-2 text-center">
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${TIPO_CORES[item.itemPcp?.tipo]}`}>
                                        {item.tipo}
                                    </span>
                                </td>
                                <td className="px-3 py-2 text-right font-mono">
                                    {parseFloat(item.quantidade).toFixed(3)}
                                </td>
                                <td className="px-3 py-2 text-center text-gray-500">
                                    {item.itemPcp?.unidade}
                                </td>
                                <td className="px-3 py-2 text-center text-gray-400 text-xs">
                                    {item.ordemEtapa || '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
