import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import pcpOrdemService from '../../services/pcpOrdemService';
import pcpReceitaService from '../../services/pcpReceitaService';

export default function OrdemProducaoForm() {
    const navigate = useNavigate();
    const [receitas, setReceitas] = useState([]);
    const [receitaSelecionada, setReceitaSelecionada] = useState(null);
    const [salvando, setSalvando] = useState(false);
    const [preview, setPreview] = useState(null);
    const [loadingPreview, setLoadingPreview] = useState(false);

    const [form, setForm] = useState({
        receitaId: '',
        quantidadePlanejada: '',
        dataPlanejada: new Date().toISOString().split('T')[0],
        observacoes: '',
    });

    useEffect(() => {
        pcpReceitaService.listar({ status: 'ativa' })
            .then(setReceitas)
            .catch(() => toast.error('Erro ao carregar receitas'));
    }, []);

    const handleReceitaChange = async (receitaId) => {
        setForm(prev => ({ ...prev, receitaId }));
        setPreview(null);
        if (receitaId) {
            const r = receitas.find(x => x.id === receitaId);
            setReceitaSelecionada(r);
        } else {
            setReceitaSelecionada(null);
        }
    };

    const handleQuantidadeChange = (quantidade) => {
        setForm(prev => ({ ...prev, quantidadePlanejada: quantidade }));
    };

    const calcularPreview = async () => {
        if (!form.receitaId || !form.quantidadePlanejada) return;
        setLoadingPreview(true);
        try {
            const res = await pcpReceitaService.escalonar(form.receitaId, {
                modo: 'por_quantidade',
                quantidade: parseFloat(form.quantidadePlanejada)
            });
            setPreview(res);
        } catch (err) {
            toast.error('Erro ao calcular preview');
        } finally {
            setLoadingPreview(false);
        }
    };

    // Auto-calcular preview quando quantidade ou receita mudam
    useEffect(() => {
        if (form.receitaId && form.quantidadePlanejada && parseFloat(form.quantidadePlanejada) > 0) {
            const timer = setTimeout(calcularPreview, 500);
            return () => clearTimeout(timer);
        }
    }, [form.receitaId, form.quantidadePlanejada]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.receitaId || !form.quantidadePlanejada || !form.dataPlanejada) {
            toast.error('Preencha receita, quantidade e data');
            return;
        }

        setSalvando(true);
        try {
            const ordem = await pcpOrdemService.criar({
                receitaId: form.receitaId,
                quantidadePlanejada: parseFloat(form.quantidadePlanejada),
                dataPlanejada: form.dataPlanejada,
                observacoes: form.observacoes || null,
            });
            toast.success(`OP #${ordem.numero} criada`);
            navigate('/pcp/ordens');
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto px-4 py-6">
            <button onClick={() => navigate('/pcp/ordens')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
                <ArrowLeft className="h-4 w-4" /> Voltar
            </button>

            <h1 className="text-2xl font-bold text-gray-800 mb-6">Nova Ordem de Producao</h1>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Receita *</label>
                        <select
                            value={form.receitaId}
                            onChange={e => handleReceitaChange(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            required
                        >
                            <option value="">Selecione uma receita...</option>
                            {receitas.map(r => (
                                <option key={r.id} value={r.id}>
                                    {r.nome} (v{r.versao}) — {r.itemPcp?.nome} — Rend: {parseFloat(r.rendimentoBase).toFixed(1)} {r.itemPcp?.unidade}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Quantidade Planejada *
                                {receitaSelecionada && (
                                    <span className="text-gray-400 font-normal ml-1">
                                        (base: {parseFloat(receitaSelecionada.rendimentoBase).toFixed(1)} {receitaSelecionada.itemPcp?.unidade})
                                    </span>
                                )}
                            </label>
                            <input
                                type="number"
                                step="0.001"
                                value={form.quantidadePlanejada}
                                onChange={e => handleQuantidadeChange(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                placeholder="Ex: 60"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Data Planejada *</label>
                            <input
                                type="date"
                                value={form.dataPlanejada}
                                onChange={e => setForm(prev => ({ ...prev, dataPlanejada: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Observacoes</label>
                        <textarea
                            value={form.observacoes}
                            onChange={e => setForm(prev => ({ ...prev, observacoes: e.target.value }))}
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>

                {/* Preview do consumo */}
                {preview && (
                    <div className="bg-blue-50 rounded-lg border border-blue-200 p-5">
                        <div className="flex items-center gap-4 mb-3">
                            <div>
                                <p className="text-xs text-blue-400">Fator</p>
                                <p className="text-lg font-bold text-blue-700">{preview.fator.toFixed(4)}x</p>
                            </div>
                            <div>
                                <p className="text-xs text-blue-400">Rendimento</p>
                                <p className="text-lg font-bold text-gray-800">{preview.rendimentoEscalado.toFixed(3)}</p>
                            </div>
                        </div>
                        <h3 className="text-xs font-semibold text-blue-600 uppercase mb-2">Consumo Previsto (snapshot)</h3>
                        <div className="space-y-1">
                            {preview.itens.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-sm">
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                        item.tipo === 'MP' ? 'bg-amber-100 text-amber-800' :
                                        item.tipo === 'SUB' ? 'bg-purple-100 text-purple-800' :
                                        'bg-blue-100 text-blue-800'
                                    }`}>{item.tipoConsumo || item.tipo}</span>
                                    <span className="text-gray-700">{item.nome}</span>
                                    <span className="font-mono text-gray-600">{item.quantidadeEscalada.toFixed(3)} {item.unidade}</span>
                                    {!item.suficiente && (
                                        <span className="text-xs text-red-500 font-medium">Estoque insuficiente ({item.estoqueAtual.toFixed(3)})</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {loadingPreview && (
                    <div className="text-center py-4 text-gray-400 text-sm">Calculando preview...</div>
                )}

                <div className="flex justify-end gap-3">
                    <button type="button" onClick={() => navigate('/pcp/ordens')} className="px-4 py-2 text-sm text-gray-600">
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={salvando}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Criar Ordem
                    </button>
                </div>
            </form>
        </div>
    );
}
