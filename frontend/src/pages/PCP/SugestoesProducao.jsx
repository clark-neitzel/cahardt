import { useState, useEffect } from 'react';
import { Lightbulb, RefreshCw, Check, X, Loader2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import pcpSugestaoService from '../../services/pcpSugestaoService';

const STATUS_BADGE = {
    PENDENTE: 'bg-yellow-100 text-yellow-800',
    ACEITA: 'bg-green-100 text-green-800',
    REJEITADA: 'bg-red-100 text-red-800',
};

export default function SugestoesProducao() {
    const [sugestoes, setSugestoes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [gerando, setGerando] = useState(false);
    const [filtroStatus, setFiltroStatus] = useState('');
    const [processando, setProcessando] = useState(null);

    const carregar = async () => {
        setLoading(true);
        try {
            const data = await pcpSugestaoService.listar(filtroStatus ? { status: filtroStatus } : {});
            setSugestoes(data);
        } catch {
            toast.error('Erro ao carregar sugestoes');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { carregar(); }, [filtroStatus]);

    const gerarSugestoes = async () => {
        setGerando(true);
        try {
            const res = await pcpSugestaoService.gerar();
            toast.success(`${res.geradas} sugestao(oes) gerada(s)`);
            carregar();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erro ao gerar sugestoes');
        } finally {
            setGerando(false);
        }
    };

    const aceitar = async (id) => {
        setProcessando(id);
        try {
            const res = await pcpSugestaoService.aceitar(id);
            toast.success(`OP #${res.numero} criada com sucesso`);
            carregar();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erro ao aceitar');
        } finally {
            setProcessando(null);
        }
    };

    const rejeitar = async (id) => {
        if (!confirm('Rejeitar esta sugestao?')) return;
        setProcessando(id);
        try {
            await pcpSugestaoService.rejeitar(id);
            toast.success('Sugestao rejeitada');
            carregar();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erro ao rejeitar');
        } finally {
            setProcessando(null);
        }
    };

    return (
        <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Lightbulb className="h-6 w-6 text-yellow-500" />
                        Sugestoes de Producao
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">Itens abaixo do estoque minimo com receita ativa</p>
                </div>
                <button
                    onClick={gerarSugestoes}
                    disabled={gerando}
                    className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600 disabled:opacity-50"
                >
                    {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Gerar Sugestoes
                </button>
            </div>

            {/* Filtros */}
            <div className="flex gap-2 mb-4">
                {['', 'PENDENTE', 'ACEITA', 'REJEITADA'].map(s => (
                    <button
                        key={s}
                        onClick={() => setFiltroStatus(s)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filtroStatus === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                        {s || 'Todas'}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
            ) : sugestoes.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                    <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p>Nenhuma sugestao encontrada</p>
                    <p className="text-xs mt-1">Clique em "Gerar Sugestoes" para analisar itens abaixo do minimo</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {sugestoes.map(s => (
                        <div key={s.id} className="bg-white rounded-lg border border-gray-200 p-4">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-1">
                                        <span className="font-semibold text-gray-800">{s.itemPcp?.nome || '—'}</span>
                                        <span className="text-xs text-gray-400">{s.itemPcp?.codigo}</span>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[s.status] || 'bg-gray-100 text-gray-600'}`}>
                                            {s.status}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm text-gray-600 mt-2">
                                        <div>
                                            <span className="text-xs text-gray-400 block">Estoque Atual</span>
                                            <span className="font-medium">{parseFloat(s.itemPcp?.estoqueAtual || 0).toFixed(1)} {s.itemPcp?.unidade}</span>
                                        </div>
                                        <div>
                                            <span className="text-xs text-gray-400 block">Estoque Minimo</span>
                                            <span className="font-medium">{parseFloat(s.itemPcp?.estoqueMinimo || 0).toFixed(1)} {s.itemPcp?.unidade}</span>
                                        </div>
                                        <div>
                                            <span className="text-xs text-gray-400 block">Qtd Sugerida</span>
                                            <span className="font-semibold text-blue-600">{parseFloat(s.quantidadeSugerida).toFixed(1)} {s.itemPcp?.unidade}</span>
                                        </div>
                                        <div>
                                            <span className="text-xs text-gray-400 block">Bateladas</span>
                                            <span className="font-semibold">{s.bateladas}</span>
                                        </div>
                                    </div>
                                    {s.observacoes && <p className="text-xs text-gray-400 mt-2">{s.observacoes}</p>}
                                </div>

                                {s.status === 'PENDENTE' && (
                                    <div className="flex items-center gap-2 ml-4 shrink-0">
                                        <button
                                            onClick={() => aceitar(s.id)}
                                            disabled={processando === s.id}
                                            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                                            title="Aceitar e gerar OP"
                                        >
                                            {processando === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                            Aceitar
                                        </button>
                                        <button
                                            onClick={() => rejeitar(s.id)}
                                            disabled={processando === s.id}
                                            className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100 disabled:opacity-50"
                                            title="Rejeitar sugestao"
                                        >
                                            <X className="h-4 w-4" />
                                            Rejeitar
                                        </button>
                                    </div>
                                )}

                                {s.status === 'ACEITA' && s.ordemProducaoId && (
                                    <div className="ml-4 shrink-0">
                                        <span className="text-xs text-green-600 font-medium">OP gerada</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
