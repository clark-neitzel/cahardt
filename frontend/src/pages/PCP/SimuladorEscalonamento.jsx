import { useState } from 'react';
import { Calculator, AlertTriangle, CheckCircle, ChevronDown, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import pcpReceitaService from '../../services/pcpReceitaService';

function BomTree({ itens, nivel = 0 }) {
    const [expandidos, setExpandidos] = useState({});

    const toggle = (id) => setExpandidos(prev => ({ ...prev, [id]: !prev[id] }));

    return (
        <div className={nivel > 0 ? 'ml-6 border-l-2 border-gray-200 pl-3' : ''}>
            {itens.map((item, idx) => {
                const temSub = item.subItens?.itens?.length > 0;
                const aberto = expandidos[item.itemPcpId + idx];
                return (
                    <div key={item.itemPcpId + idx} className="py-1">
                        <div className="flex items-center gap-2 text-sm">
                            {temSub ? (
                                <button onClick={() => toggle(item.itemPcpId + idx)} className="p-0.5 hover:bg-gray-100 rounded">
                                    {aberto ? <ChevronDown className="h-3.5 w-3.5 text-gray-500" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-500" />}
                                </button>
                            ) : (
                                <span className="w-5" />
                            )}
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                item.tipo === 'MP' ? 'bg-amber-100 text-amber-800' :
                                item.tipo === 'SUB' ? 'bg-purple-100 text-purple-800' :
                                'bg-blue-100 text-blue-800'
                            }`}>{item.tipoConsumo || item.tipo}</span>
                            <span className="font-medium text-gray-800">{item.nome}</span>
                            <span className="font-mono text-gray-600">
                                {item.quantidadeEscalada.toFixed(3)} {item.unidade}
                            </span>
                            <span className="text-xs text-gray-400">
                                (base: {item.quantidadeBase.toFixed(3)})
                            </span>
                            {item.suficiente !== undefined && (
                                item.suficiente
                                    ? <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                                    : <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                            )}
                            {item.estoqueAtual !== undefined && (
                                <span className="text-xs text-gray-400">
                                    (estoque: {item.estoqueAtual.toFixed(3)})
                                </span>
                            )}
                        </div>
                        {temSub && aberto && (
                            <BomTree itens={item.subItens.itens} nivel={nivel + 1} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export default function SimuladorEscalonamento({ receitaId, itensReceita }) {
    const [modo, setModo] = useState('por_quantidade');
    const [quantidade, setQuantidade] = useState('');
    const [itemLimitanteId, setItemLimitanteId] = useState('');
    const [qtdDisponivel, setQtdDisponivel] = useState('');
    const [resultado, setResultado] = useState(null);
    const [loading, setLoading] = useState(false);

    const simular = async () => {
        if (modo === 'por_quantidade' && (!quantidade || parseFloat(quantidade) <= 0)) {
            toast.error('Informe a quantidade desejada');
            return;
        }
        if (modo === 'por_ingrediente' && (!itemLimitanteId || !qtdDisponivel)) {
            toast.error('Selecione o ingrediente e informe a quantidade disponivel');
            return;
        }

        setLoading(true);
        try {
            const dados = { modo };
            if (modo === 'por_quantidade') {
                dados.quantidade = parseFloat(quantidade);
            } else {
                dados.itemPcpIdLimitante = itemLimitanteId;
                dados.quantidadeDisponivel = parseFloat(qtdDisponivel);
            }
            const res = await pcpReceitaService.escalonar(receitaId, dados);
            setResultado(res);
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-lg border border-blue-200 p-5">
            <h2 className="text-sm font-semibold text-blue-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                <Calculator className="h-4 w-4" /> Simulador de Escalonamento
            </h2>

            <div className="flex flex-wrap gap-3 mb-4">
                {/* Modo */}
                <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                    <button
                        onClick={() => { setModo('por_quantidade'); setResultado(null); }}
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                            modo === 'por_quantidade' ? 'bg-white text-blue-700 shadow-sm font-medium' : 'text-gray-600 hover:text-gray-800'
                        }`}
                    >
                        Por Quantidade
                    </button>
                    <button
                        onClick={() => { setModo('por_ingrediente'); setResultado(null); }}
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                            modo === 'por_ingrediente' ? 'bg-white text-blue-700 shadow-sm font-medium' : 'text-gray-600 hover:text-gray-800'
                        }`}
                    >
                        Por Ingrediente Limitante
                    </button>
                </div>

                {modo === 'por_quantidade' ? (
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-600">Quero produzir:</label>
                        <input
                            type="number"
                            step="0.001"
                            value={quantidade}
                            onChange={e => setQuantidade(e.target.value)}
                            className="w-32 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            placeholder="Ex: 60"
                        />
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-600">Tenho</label>
                        <input
                            type="number"
                            step="0.001"
                            value={qtdDisponivel}
                            onChange={e => setQtdDisponivel(e.target.value)}
                            className="w-28 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            placeholder="10"
                        />
                        <label className="text-sm text-gray-600">de</label>
                        <select
                            value={itemLimitanteId}
                            onChange={e => setItemLimitanteId(e.target.value)}
                            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">Selecione ingrediente...</option>
                            {itensReceita?.map(i => (
                                <option key={i.itemPcpId || i.id} value={i.itemPcpId || i.itemPcp?.id}>
                                    {i.itemPcp?.nome || i.nome}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <button
                    onClick={simular}
                    disabled={loading}
                    className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                    {loading ? 'Calculando...' : 'Recalcular'}
                </button>
            </div>

            {/* Resultado */}
            {resultado && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex gap-6 mb-4">
                        <div>
                            <p className="text-xs text-gray-400">Fator</p>
                            <p className="text-lg font-bold text-blue-700">{resultado.fator.toFixed(4)}x</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">Rendimento Escalado</p>
                            <p className="text-lg font-bold text-gray-800">{resultado.rendimentoEscalado.toFixed(3)}</p>
                        </div>
                    </div>

                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Arvore de Materiais (BOM)</h3>
                    <BomTree itens={resultado.itens} />
                </div>
            )}
        </div>
    );
}
