import { useState, useEffect, useCallback } from 'react';
import { Play, CheckCircle, XCircle, ClipboardList, Loader2, X, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import pcpOrdemService from '../../services/pcpOrdemService';
import { useAuth } from '../../contexts/AuthContext';

const STATUS_CORES = {
    PLANEJADA: 'border-blue-300 bg-blue-50',
    EM_PRODUCAO: 'border-yellow-300 bg-yellow-50',
    FINALIZADA: 'border-green-300 bg-green-50',
    CANCELADA: 'border-red-300 bg-red-50',
};

const STATUS_BADGE = {
    PLANEJADA: 'bg-blue-100 text-blue-800',
    EM_PRODUCAO: 'bg-yellow-100 text-yellow-800',
    FINALIZADA: 'bg-green-100 text-green-800',
    CANCELADA: 'bg-red-100 text-red-600',
};

export default function PainelOperacional() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const podeCancelar = !!(user?.permissoes?.admin || user?.permissoes?.pcp?.cancelarOrdens);
    const [ordens, setOrdens] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandido, setExpandido] = useState({});
    const [modalFinalizar, setModalFinalizar] = useState(null);
    const [qtdProduzida, setQtdProduzida] = useState('');
    const [consumosEdit, setConsumosEdit] = useState({});
    const [processando, setProcessando] = useState(null);

    const carregar = useCallback(async () => {
        try {
            setLoading(true);
            // Carregar planejadas e em producao
            const [plan, prod, fin] = await Promise.all([
                pcpOrdemService.listar({ status: 'PLANEJADA', tamanhoPagina: 50 }),
                pcpOrdemService.listar({ status: 'EM_PRODUCAO', tamanhoPagina: 50 }),
                pcpOrdemService.listar({ status: 'FINALIZADA', tamanhoPagina: 10 }),
            ]);
            setOrdens([...prod.items, ...plan.items, ...fin.items]);
        } catch (err) {
            toast.error('Erro ao carregar painel');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { carregar(); }, [carregar]);

    const carregarDetalhe = async (ordemId) => {
        if (expandido[ordemId]) {
            setExpandido(prev => ({ ...prev, [ordemId]: null }));
            return;
        }
        try {
            const detalhe = await pcpOrdemService.buscarPorId(ordemId);
            setExpandido(prev => ({ ...prev, [ordemId]: detalhe }));
            // Pre-fill consumos
            const consumos = {};
            detalhe.itensConsumo.forEach(c => {
                consumos[c.id] = parseFloat(c.quantidadeReal) > 0
                    ? String(c.quantidadeReal)
                    : String(c.quantidadePrevista);
            });
            setConsumosEdit(prev => ({ ...prev, [ordemId]: consumos }));
        } catch (err) {
            toast.error('Erro ao carregar detalhe');
        }
    };

    const iniciarOrdem = async (ordemId) => {
        setProcessando(ordemId);
        try {
            await pcpOrdemService.iniciar(ordemId);
            toast.success('Ordem iniciada');
            carregar();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        } finally {
            setProcessando(null);
        }
    };

    const salvarConsumos = async (ordemId) => {
        const detalhe = expandido[ordemId];
        if (!detalhe) return;

        const consumos = detalhe.itensConsumo.map(c => ({
            ordemConsumoId: c.id,
            quantidadeReal: parseFloat(consumosEdit[ordemId]?.[c.id] || c.quantidadePrevista)
        }));

        setProcessando(ordemId);
        try {
            await pcpOrdemService.apontarConsumo(ordemId, consumos);
            toast.success('Consumos apontados');
            carregarDetalhe(ordemId);
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        } finally {
            setProcessando(null);
        }
    };

    const abrirFinalizar = (ordem) => {
        setModalFinalizar(ordem);
        setQtdProduzida(String(ordem.quantidadePlanejada));
    };

    const finalizarOrdem = async () => {
        if (!qtdProduzida || parseFloat(qtdProduzida) <= 0) {
            toast.error('Quantidade produzida deve ser > 0');
            return;
        }
        setProcessando(modalFinalizar.id);
        try {
            await pcpOrdemService.finalizar(modalFinalizar.id, parseFloat(qtdProduzida));
            toast.success('Ordem finalizada');
            setModalFinalizar(null);
            carregar();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        } finally {
            setProcessando(null);
        }
    };

    const cancelarOrdem = async (ordemId) => {
        if (!confirm('Cancelar esta ordem?')) return;
        setProcessando(ordemId);
        try {
            await pcpOrdemService.cancelar(ordemId);
            toast.success('Ordem cancelada');
            carregar();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        } finally {
            setProcessando(null);
        }
    };

    if (loading) return <div className="text-center py-12 text-gray-400">Carregando painel...</div>;

    const emProducao = ordens.filter(o => o.status === 'EM_PRODUCAO');
    const planejadas = ordens.filter(o => o.status === 'PLANEJADA');
    const finalizadas = ordens.filter(o => o.status === 'FINALIZADA');

    return (
        <div className="max-w-5xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Painel de Producao</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {emProducao.length} em producao, {planejadas.length} planejadas
                    </p>
                </div>
                <button
                    onClick={() => navigate('/pcp/ordens')}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                    <ClipboardList className="h-4 w-4" /> Todas Ordens
                </button>
            </div>

            {/* Em Producao */}
            {emProducao.length > 0 && (
                <div className="mb-6">
                    <h2 className="text-sm font-semibold text-yellow-700 uppercase tracking-wide mb-3">Em Producao ({emProducao.length})</h2>
                    <div className="space-y-3">
                        {emProducao.map(ordem => (
                            <OrdemCard
                                key={ordem.id}
                                ordem={ordem}
                                expandido={expandido[ordem.id]}
                                consumosEdit={consumosEdit[ordem.id]}
                                setConsumoEdit={(consumoId, val) =>
                                    setConsumosEdit(prev => ({ ...prev, [ordem.id]: { ...prev[ordem.id], [consumoId]: val } }))
                                }
                                onToggleExpand={() => carregarDetalhe(ordem.id)}
                                onSalvarConsumos={() => salvarConsumos(ordem.id)}
                                onFinalizar={() => abrirFinalizar(ordem)}
                                onCancelar={podeCancelar ? () => cancelarOrdem(ordem.id) : null}
                                processando={processando === ordem.id}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Planejadas */}
            {planejadas.length > 0 && (
                <div className="mb-6">
                    <h2 className="text-sm font-semibold text-blue-700 uppercase tracking-wide mb-3">Planejadas ({planejadas.length})</h2>
                    <div className="space-y-3">
                        {planejadas.map(ordem => (
                            <OrdemCard
                                key={ordem.id}
                                ordem={ordem}
                                expandido={expandido[ordem.id]}
                                consumosEdit={consumosEdit[ordem.id]}
                                setConsumoEdit={(consumoId, val) =>
                                    setConsumosEdit(prev => ({ ...prev, [ordem.id]: { ...prev[ordem.id], [consumoId]: val } }))
                                }
                                onToggleExpand={() => carregarDetalhe(ordem.id)}
                                onIniciar={() => iniciarOrdem(ordem.id)}
                                onCancelar={podeCancelar ? () => cancelarOrdem(ordem.id) : null}
                                processando={processando === ordem.id}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Finalizadas recentes */}
            {finalizadas.length > 0 && (
                <div>
                    <h2 className="text-sm font-semibold text-green-700 uppercase tracking-wide mb-3">Finalizadas Recentes</h2>
                    <div className="space-y-2">
                        {finalizadas.map(ordem => (
                            <div key={ordem.id} className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-between">
                                <div>
                                    <span className="font-mono text-xs text-gray-400">#{ordem.numero}</span>
                                    <span className="ml-2 font-medium text-gray-700">{ordem.receita?.nome}</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm">
                                    <span className="text-gray-500">
                                        {parseFloat(ordem.quantidadeProduzida).toFixed(1)} / {parseFloat(ordem.quantidadePlanejada).toFixed(1)}
                                    </span>
                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {ordens.length === 0 && (
                <div className="text-center py-12">
                    <ClipboardList className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500">Nenhuma ordem de producao</p>
                    <button
                        onClick={() => navigate('/pcp/ordens/nova')}
                        className="mt-3 text-sm text-blue-600 hover:underline"
                    >
                        Criar nova ordem
                    </button>
                </div>
            )}

            {/* Modal Finalizar */}
            {modalFinalizar && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-800">Finalizar OP #{modalFinalizar.numero}</h3>
                            <button onClick={() => setModalFinalizar(null)} className="p-1 text-gray-400 hover:text-gray-600">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <p className="text-sm text-gray-500 mb-2">{modalFinalizar.receita?.nome}</p>
                        <p className="text-sm text-gray-500 mb-4">
                            Planejada: <strong>{parseFloat(modalFinalizar.quantidadePlanejada).toFixed(3)}</strong>
                        </p>

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade Produzida Real</label>
                            <input
                                type="number"
                                step="0.001"
                                value={qtdProduzida}
                                onChange={e => setQtdProduzida(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                autoFocus
                            />
                        </div>

                        {parseFloat(qtdProduzida) !== parseFloat(modalFinalizar.quantidadePlanejada) && qtdProduzida && (
                            <p className="text-xs text-amber-600 mb-4">
                                Diferenca: {(parseFloat(qtdProduzida) - parseFloat(modalFinalizar.quantidadePlanejada)).toFixed(3)}
                                ({((parseFloat(qtdProduzida) / parseFloat(modalFinalizar.quantidadePlanejada)) * 100).toFixed(1)}% do planejado)
                            </p>
                        )}

                        <div className="flex justify-end gap-3">
                            <button onClick={() => setModalFinalizar(null)} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
                            <button
                                onClick={finalizarOrdem}
                                disabled={processando === modalFinalizar.id}
                                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                            >
                                {processando === modalFinalizar.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                                Finalizar Ordem
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function OrdemCard({ ordem, expandido, consumosEdit, setConsumoEdit, onToggleExpand, onIniciar, onSalvarConsumos, onFinalizar, onCancelar, processando }) {
    return (
        <div className={`rounded-lg border-2 ${STATUS_CORES[ordem.status]} transition-all`}>
            {/* Header */}
            <div className="p-4 flex items-center justify-between cursor-pointer" onClick={onToggleExpand}>
                <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-gray-400">#{ordem.numero}</span>
                    <div>
                        <p className="font-medium text-gray-800">{ordem.receita?.nome}</p>
                        <p className="text-xs text-gray-500">
                            {ordem.receita?.itemPcp?.nome} — {parseFloat(ordem.quantidadePlanejada).toFixed(1)} {ordem.receita?.itemPcp?.unidade}
                            {' — '}{new Date(ordem.dataPlanejada).toLocaleDateString('pt-BR')}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[ordem.status]}`}>
                        {ordem.status === 'EM_PRODUCAO' ? 'Em Producao' : ordem.status === 'PLANEJADA' ? 'Planejada' : ordem.status}
                    </span>
                    {expandido ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                </div>
            </div>

            {/* Expandido: consumos + acoes */}
            {expandido && (
                <div className="px-4 pb-4 border-t border-gray-200/50">
                    {/* Consumos */}
                    <div className="mt-3">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Materiais</h4>
                        <div className="space-y-1.5">
                            {expandido.itensConsumo?.map(c => (
                                <div key={c.id} className="flex items-center gap-2 text-sm">
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                        c.itemPcp?.tipo === 'MP' ? 'bg-amber-100 text-amber-800' :
                                        c.itemPcp?.tipo === 'SUB' ? 'bg-purple-100 text-purple-800' :
                                        'bg-blue-100 text-blue-800'
                                    }`}>{c.tipo}</span>
                                    <span className="text-gray-700 flex-1">{c.itemPcp?.nome}</span>
                                    <span className="text-xs text-gray-400">prev: {parseFloat(c.quantidadePrevista).toFixed(3)}</span>
                                    {ordem.status === 'EM_PRODUCAO' && (
                                        <input
                                            type="number"
                                            step="0.001"
                                            value={consumosEdit?.[c.id] || ''}
                                            onChange={e => setConsumoEdit(c.id, e.target.value)}
                                            onClick={e => e.stopPropagation()}
                                            className="w-24 px-2 py-1 border border-gray-300 rounded text-xs text-right"
                                            placeholder="real"
                                        />
                                    )}
                                    {ordem.status !== 'EM_PRODUCAO' && parseFloat(c.quantidadeReal) > 0 && (
                                        <span className="text-xs font-medium text-gray-600">real: {parseFloat(c.quantidadeReal).toFixed(3)}</span>
                                    )}
                                    <span className="text-xs text-gray-400">{c.itemPcp?.unidade}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Acoes */}
                    <div className="flex gap-2 mt-4 pt-3 border-t border-gray-200/50">
                        {ordem.status === 'PLANEJADA' && onIniciar && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onIniciar(); }}
                                disabled={processando}
                                className="flex items-center gap-1 px-3 py-1.5 bg-yellow-500 text-white rounded-lg text-sm hover:bg-yellow-600 disabled:opacity-50"
                            >
                                {processando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                                Iniciar Producao
                            </button>
                        )}
                        {ordem.status === 'EM_PRODUCAO' && onSalvarConsumos && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onSalvarConsumos(); }}
                                disabled={processando}
                                className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300 disabled:opacity-50"
                            >
                                Salvar Consumos
                            </button>
                        )}
                        {ordem.status === 'EM_PRODUCAO' && onFinalizar && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onFinalizar(); }}
                                disabled={processando}
                                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                            >
                                <CheckCircle className="h-3.5 w-3.5" /> Finalizar
                            </button>
                        )}
                        {['PLANEJADA', 'EM_PRODUCAO'].includes(ordem.status) && onCancelar && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onCancelar(); }}
                                disabled={processando}
                                className="flex items-center gap-1 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-sm"
                            >
                                <XCircle className="h-3.5 w-3.5" /> Cancelar
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
