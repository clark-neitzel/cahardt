import { useState, useEffect, useCallback } from 'react';
import { Plus, ClipboardList, XCircle, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import pcpOrdemService from '../../services/pcpOrdemService';
import { useAuth } from '../../contexts/AuthContext';

const STATUS_CORES = {
    PLANEJADA: 'bg-blue-100 text-blue-800',
    EM_PRODUCAO: 'bg-yellow-100 text-yellow-800',
    FINALIZADA: 'bg-green-100 text-green-800',
    CANCELADA: 'bg-red-100 text-red-600',
};

const STATUS_LABELS = {
    PLANEJADA: 'Planejada',
    EM_PRODUCAO: 'Em Producao',
    FINALIZADA: 'Finalizada',
    CANCELADA: 'Cancelada',
};

export default function OrdensProducao() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const podeCancelar = !!(user?.permissoes?.admin || user?.permissoes?.pcp?.cancelarOrdens);
    const [ordens, setOrdens] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [statusFiltro, setStatusFiltro] = useState('');
    const [pagina, setPagina] = useState(1);

    const carregar = useCallback(async () => {
        try {
            setLoading(true);
            const params = { pagina, tamanhoPagina: 30 };
            if (statusFiltro) params.status = statusFiltro;
            const data = await pcpOrdemService.listar(params);
            setOrdens(data.items);
            setTotal(data.total);
        } catch (err) {
            toast.error('Erro ao carregar ordens');
        } finally {
            setLoading(false);
        }
    }, [statusFiltro, pagina]);

    useEffect(() => { carregar(); }, [carregar]);

    const cancelar = async (id) => {
        if (!confirm('Cancelar esta ordem?')) return;
        try {
            await pcpOrdemService.cancelar(id);
            toast.success('Ordem cancelada');
            carregar();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        }
    };

    const excluir = async (id) => {
        if (!confirm('Excluir esta ordem definitivamente? Esta ação não pode ser desfeita.')) return;
        try {
            await pcpOrdemService.excluir(id);
            toast.success('Ordem excluída');
            carregar();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        }
    };

    return (
        <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Ordens de Producao</h1>
                    <p className="text-sm text-gray-500 mt-1">{total} ordens no total</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => navigate('/pcp/painel')}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        Painel
                    </button>
                    <button
                        onClick={() => navigate('/pcp/ordens/nova')}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        <Plus className="h-4 w-4" />
                        Nova Ordem
                    </button>
                </div>
            </div>

            {/* Filtros */}
            <div className="flex gap-2 mb-4">
                {['', 'PLANEJADA', 'EM_PRODUCAO', 'FINALIZADA', 'CANCELADA'].map(s => (
                    <button
                        key={s}
                        onClick={() => { setStatusFiltro(s); setPagina(1); }}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                            statusFiltro === s
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                        {s ? STATUS_LABELS[s] : 'Todas'}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="text-center py-12 text-gray-400">Carregando...</div>
            ) : ordens.length === 0 ? (
                <div className="text-center py-12">
                    <ClipboardList className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500">Nenhuma ordem encontrada</p>
                </div>
            ) : (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium text-gray-600">#</th>
                                <th className="text-left px-4 py-3 font-medium text-gray-600">Receita / Produto</th>
                                <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                                <th className="text-right px-4 py-3 font-medium text-gray-600">Planejada</th>
                                <th className="text-right px-4 py-3 font-medium text-gray-600">Produzida</th>
                                <th className="text-right px-4 py-3 font-medium text-gray-600">Fator</th>
                                <th className="text-center px-4 py-3 font-medium text-gray-600">Data</th>
                                {podeCancelar && <th className="text-center px-4 py-3 font-medium text-gray-600">Ações</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {ordens.map(ordem => (
                                <tr
                                    key={ordem.id}
                                    onClick={() => navigate(`/pcp/painel`)}
                                    className="hover:bg-gray-50 cursor-pointer"
                                >
                                    <td className="px-4 py-3 font-mono text-xs text-gray-500">#{ordem.numero}</td>
                                    <td className="px-4 py-3">
                                        <span className="font-medium text-gray-800">{ordem.receita?.nome}</span>
                                        <span className="block text-xs text-gray-400">
                                            {ordem.receita?.itemPcp?.nome} (v{ordem.receita?.versao})
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CORES[ordem.status]}`}>
                                            {STATUS_LABELS[ordem.status]}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono">
                                        {parseFloat(ordem.quantidadePlanejada).toFixed(3)}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono">
                                        {parseFloat(ordem.quantidadeProduzida).toFixed(3)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-500">
                                        {parseFloat(ordem.fatorEscala).toFixed(4)}x
                                    </td>
                                    <td className="px-4 py-3 text-center text-xs text-gray-500">
                                        {new Date(ordem.dataPlanejada).toLocaleDateString('pt-BR')}
                                    </td>
                                    {podeCancelar && (
                                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center justify-center gap-2">
                                                {['PLANEJADA', 'EM_PRODUCAO'].includes(ordem.status) && (
                                                    <button
                                                        onClick={() => cancelar(ordem.id)}
                                                        title="Cancelar ordem"
                                                        className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                                    >
                                                        <XCircle className="h-4 w-4" />
                                                    </button>
                                                )}
                                                {['CANCELADA', 'PLANEJADA'].includes(ordem.status) && (
                                                    <button
                                                        onClick={() => excluir(ordem.id)}
                                                        title="Excluir ordem"
                                                        className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Paginacao simples */}
            {total > 30 && (
                <div className="flex justify-center gap-2 mt-4">
                    <button
                        onClick={() => setPagina(p => Math.max(1, p - 1))}
                        disabled={pagina === 1}
                        className="px-3 py-1 text-sm bg-gray-100 rounded disabled:opacity-50"
                    >
                        Anterior
                    </button>
                    <span className="px-3 py-1 text-sm text-gray-500">Pagina {pagina}</span>
                    <button
                        onClick={() => setPagina(p => p + 1)}
                        disabled={ordens.length < 30}
                        className="px-3 py-1 text-sm bg-gray-100 rounded disabled:opacity-50"
                    >
                        Proxima
                    </button>
                </div>
            )}
        </div>
    );
}
