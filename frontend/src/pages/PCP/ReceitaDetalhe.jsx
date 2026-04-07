import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Copy, Calculator, Trash2 } from 'lucide-react';
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

    useEffect(() => {
        pcpReceitaService.buscarPorId(id)
            .then(setReceita)
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

    const criarNovaVersao = async () => {
        try {
            const nova = await pcpReceitaService.novaVersao(id);
            toast.success(`Nova versao v${nova.versao} criada`);
            navigate(`/pcp/receitas/${nova.id}`);
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
                        onClick={criarNovaVersao}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200"
                    >
                        <Copy className="h-3.5 w-3.5" /> Nova Versao
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
