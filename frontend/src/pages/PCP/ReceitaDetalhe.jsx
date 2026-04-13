import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Copy, Calculator, Trash2, History, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import pcpReceitaService from '../../services/pcpReceitaService';
import pcpItemService from '../../services/pcpItemService';
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
    const [itensMap, setItensMap] = useState({});

    useEffect(() => {
        setLoading(true);
        pcpReceitaService.buscarPorId(id)
            .then(async (r) => {
                setReceita(r);
                if (r?.itemPcpId) {
                    try {
                        const [h, l, itens] = await Promise.all([
                            pcpReceitaService.historico(r.itemPcpId),
                            pcpReceitaService.logs(id),
                            pcpItemService.listar({})
                        ]);
                        setHistorico(h);
                        setLogs(l);
                        const map = {};
                        (Array.isArray(itens) ? itens : []).forEach(i => { map[i.id] = i; });
                        setItensMap(map);
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
                <div className="bg-white rounded-lg border border-gray-200 mb-4 overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                        <h2 className="text-sm font-semibold text-gray-700">Histórico de versões</h2>
                    </div>
                    <div className="p-5">
                        <ol className="relative border-l-2 border-gray-200 ml-2 space-y-4">
                            {historico.map(v => {
                                const ativa = v.id === id;
                                const log = v.logs?.[0];
                                return (
                                    <li key={v.id} className="ml-5">
                                        <span className={`absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full border-2 ${ativa ? 'bg-blue-600 border-blue-600' : v.status === 'ativa' ? 'bg-green-500 border-green-500' : 'bg-gray-300 border-gray-300'}`}></span>
                                        <button
                                            onClick={() => navigate(`/pcp/receitas/${v.id}`)}
                                            className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${ativa ? 'border-blue-300 bg-blue-50 shadow-sm' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-base font-bold text-gray-800">v{v.versao}</span>
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${STATUS_CORES[v.status]}`}>{v.status}</span>
                                                    {ativa && <span className="text-[10px] text-blue-600 font-medium">(visualizando)</span>}
                                                </div>
                                                <ChevronRight className="h-4 w-4 text-gray-400" />
                                            </div>
                                            {log ? (
                                                <div className="mt-1.5 text-xs text-gray-600">
                                                    <span className="font-medium text-gray-700">{log.alteradoPorNome || 'Sistema'}</span>
                                                    <span className="text-gray-400"> · {new Date(log.alteradoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                                                    <div className="mt-0.5 italic text-gray-600 truncate">"{log.motivo}"</div>
                                                </div>
                                            ) : (
                                                <div className="mt-1.5 text-xs text-gray-400">
                                                    Versão inicial · {v.dataInicioVigencia ? new Date(v.dataInicioVigencia).toLocaleDateString('pt-BR') : '—'}
                                                </div>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ol>
                    </div>

                    {logs.length > 0 && (
                        <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Detalhes da alteração</h3>
                            {logs.map(log => (
                                <div key={log.id} className="bg-white rounded-lg border border-gray-200 p-4 mb-3 last:mb-0">
                                    <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                                        <div>
                                            <div className="text-sm font-semibold text-gray-800">{log.alteradoPorNome || 'Sistema'}</div>
                                            <div className="text-xs text-gray-500">{new Date(log.alteradoEm).toLocaleString('pt-BR')}</div>
                                        </div>
                                        <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs font-medium">v{log.versao}</span>
                                    </div>
                                    <div className="py-3 border-b border-gray-100">
                                        <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Motivo</div>
                                        <p className="text-sm text-gray-800">{log.motivo}</p>
                                    </div>

                                    <div className="pt-3 space-y-3">
                                        {log.alteracoes?.campos && Object.keys(log.alteracoes.campos).length > 0 && (
                                            <div>
                                                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Dados da receita</div>
                                                <div className="space-y-1">
                                                    {Object.entries(log.alteracoes.campos).map(([k, v]) => {
                                                        const labels = { nome: 'Nome', rendimentoBase: 'Rendimento base', perdaPercentual: 'Perda (%)', observacoes: 'Observações' };
                                                        return (
                                                            <div key={k} className="flex items-center gap-2 text-sm">
                                                                <span className="text-gray-600 min-w-[120px]">{labels[k] || k}:</span>
                                                                <span className="line-through text-gray-400 text-xs">{String(v.de ?? '—')}</span>
                                                                <ChevronRight className="h-3 w-3 text-gray-400" />
                                                                <span className="text-gray-900 font-medium">{String(v.para ?? '—')}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {log.alteracoes?.ingredientes?.adicionados?.length > 0 && (
                                            <div>
                                                <div className="text-[11px] font-semibold text-green-700 uppercase tracking-wider mb-1.5">+ Ingredientes adicionados</div>
                                                <ul className="space-y-1">
                                                    {log.alteracoes.ingredientes.adicionados.map((i, idx) => {
                                                        const info = itensMap[i.itemPcpId];
                                                        const nome = i.nome || info?.nome || 'Item removido';
                                                        const unid = i.unidade || info?.unidade || '';
                                                        return (
                                                            <li key={idx} className="flex items-center justify-between text-sm bg-green-50 border border-green-100 rounded px-3 py-1.5">
                                                                <span className="text-gray-800 font-medium">{nome}</span>
                                                                <span className="text-xs text-gray-600">{i.quantidade} {unid} <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold ${TIPO_CORES[i.tipo]}`}>{i.tipo}</span></span>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            </div>
                                        )}

                                        {log.alteracoes?.ingredientes?.removidos?.length > 0 && (
                                            <div>
                                                <div className="text-[11px] font-semibold text-red-700 uppercase tracking-wider mb-1.5">− Ingredientes removidos</div>
                                                <ul className="space-y-1">
                                                    {log.alteracoes.ingredientes.removidos.map((i, idx) => {
                                                        const info = itensMap[i.itemPcpId];
                                                        const nome = i.nome || info?.nome || 'Item removido';
                                                        const unid = i.unidade || info?.unidade || '';
                                                        return (
                                                            <li key={idx} className="flex items-center justify-between text-sm bg-red-50 border border-red-100 rounded px-3 py-1.5">
                                                                <span className="text-gray-800 font-medium line-through">{nome}</span>
                                                                <span className="text-xs text-gray-600">{i.quantidade} {unid} <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold ${TIPO_CORES[i.tipo]}`}>{i.tipo}</span></span>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            </div>
                                        )}

                                        {log.alteracoes?.ingredientes?.alterados?.length > 0 && (
                                            <div>
                                                <div className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider mb-1.5">~ Quantidades alteradas</div>
                                                <ul className="space-y-1">
                                                    {log.alteracoes.ingredientes.alterados.map((i, idx) => {
                                                        const info = itensMap[i.itemPcpId];
                                                        const nome = i.nome || info?.nome || 'Item';
                                                        const unid = i.unidade || info?.unidade || '';
                                                        return (
                                                            <li key={idx} className="flex items-center justify-between text-sm bg-amber-50 border border-amber-100 rounded px-3 py-1.5">
                                                                <span className="text-gray-800 font-medium">{nome}</span>
                                                                <span className="text-xs text-gray-600 flex items-center gap-1.5">
                                                                    <span className="line-through text-gray-400">{i.quantidade.de} {unid}</span>
                                                                    <ChevronRight className="h-3 w-3 text-gray-400" />
                                                                    <span className="text-gray-900 font-semibold">{i.quantidade.para} {unid}</span>
                                                                </span>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
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
