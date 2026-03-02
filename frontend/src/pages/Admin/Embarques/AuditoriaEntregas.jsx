import React, { useState, useEffect } from 'react';
import { Search, AlertTriangle, CheckCircle, Package, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../services/api';

const AuditoriaEntregas = () => {
    const [entregas, setEntregas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filtroDivergente, setFiltroDivergente] = useState(false);
    const [embarqueIdFilter, setEmbarqueIdFilter] = useState('');

    const fetchAuditoria = async () => {
        try {
            setLoading(true);
            const params = {};
            if (filtroDivergente) params.divergente = true;
            if (embarqueIdFilter) params.embarqueId = embarqueIdFilter;

            const response = await api.get('/entregas/auditoria', { params });
            setEntregas(response.data);
        } catch (error) {
            console.error('Erro ao buscar auditoria:', error);
            toast.error('Erro de conexão ao auditar as viagens.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAuditoria();
    }, [filtroDivergente, embarqueIdFilter]);

    const handleEstorno = async (pedidoId, cliente) => {
        if (!window.confirm(`ATENÇÃO FINANCEIRO: Tem certeza que deseja estornar a baixa de entrega do cliente ${cliente}? Essa ação apagará a entrada de dinheiro do caixa do motorista e devolverá o pedido para o Caminhão.`)) return;

        try {
            await api.delete(`/entregas/${pedidoId}/estorno`);
            toast.success('Check-in logístico estornado com sucesso!');
            fetchAuditoria();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro Crítico. Requer privilégio financeiro.');
        }
    };

    return (
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                        <AlertTriangle className="h-6 w-6 text-amber-500 mr-2" />
                        Auditoria de Acerto de Contas (Logística)
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Monitoramento contábil e reversão de viagens finalizadas pelos caminhoneiros.
                    </p>
                </div>
            </div>

            <div className="bg-white p-4 rounded-t-lg shadow-sm border-b flex items-center space-x-4">
                <div className="flex items-center">
                    <input
                        type="checkbox"
                        id="divergente"
                        className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded"
                        checked={filtroDivergente}
                        onChange={(e) => setFiltroDivergente(e.target.checked)}
                    />
                    <label htmlFor="divergente" className="ml-2 block text-sm text-gray-900 font-medium cursor-pointer">
                        Trazer apenas Alertas (Divergência de Pagamento)
                    </label>
                </div>

                <div className="flex-1 max-w-sm">
                    <input
                        type="text"
                        placeholder="Filtrar por ID do Embarque (Opcional)"
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                        value={embarqueIdFilter}
                        onChange={(e) => setEmbarqueIdFilter(e.target.value)}
                    />
                </div>
            </div>

            <div className="bg-white shadow overflow-x-auto sm:rounded-b-lg">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Data Fechamento</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Viagem / Resp.</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">NF / Cliente</th>
                            <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Status Físico</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Caixa Recebido / Devoluções</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações (Admin)</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200 text-sm">
                        {loading ? (
                            <tr><td colSpan="6" className="px-6 py-8 text-center text-gray-500">Varrendo histórico logístico...</td></tr>
                        ) : entregas.length === 0 ? (
                            <tr><td colSpan="6" className="px-6 py-8 text-center text-gray-500">Nenhuma viagem finalizada encontrada.</td></tr>
                        ) : entregas.map((entrega) => (
                            <tr key={entrega.id} className={entrega.divergenciaPagamento ? "bg-amber-50" : "hover:bg-gray-50"}>
                                <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                                    {new Date(entrega.dataEntrega).toLocaleString('pt-BR')}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-gray-900 font-medium">
                                    <div className="flex flex-col">
                                        <span className="flex items-center font-mono"><Truck className="h-3 w-3 mr-1" /> #{entrega.embarque?.numero}</span>
                                        <span className="text-xs text-gray-500">{entrega.embarque?.responsavel?.nome}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-gray-900">{entrega.cliente?.NomeFantasia}</span>
                                        <span className="text-xs text-gray-500 font-mono">Ped CA: {entrega.numero || 'S/N'}</span>
                                    </div>
                                    {entrega.gpsEntrega && (
                                        <a href={`https://www.google.com/maps?q=${entrega.gpsEntrega}`} target="_blank" rel="noreferrer" className="text-[10px] text-sky-600 hover:underline inline-block mt-1">
                                            📍 Ver no Mapa
                                        </a>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                    {entrega.statusEntrega === 'ENTREGUE' && <span className="px-2 py-1 text-xs font-bold bg-green-100 text-green-800 rounded-full">ENTREGUE 100%</span>}
                                    {entrega.statusEntrega === 'ENTREGUE_PARCIAL' && <span className="px-2 py-1 text-xs font-bold bg-amber-100 text-amber-800 rounded-full">PARCIAL (Faltou)</span>}
                                    {entrega.statusEntrega === 'DEVOLVIDO' && <span className="px-2 py-1 text-xs font-bold bg-red-100 text-red-800 rounded-full">VOLTOU TUDO</span>}
                                </td>
                                <td className="px-6 py-4 text-xs">
                                    {entrega.divergenciaPagamento && (
                                        <div className="text-amber-700 font-bold mb-1 flex items-center">
                                            <AlertTriangle className="h-3 w-3 mr-1" />
                                            Alerta de Quebra de Expectativa (Era Prazo, pagou Avista, etc)
                                        </div>
                                    )}
                                    {entrega.pagamentosReais?.length > 0 ? (
                                        <div className="space-y-1">
                                            {entrega.pagamentosReais.map(pg => (
                                                <div key={pg.id} className="text-green-700">
                                                    + R$ {Number(pg.valor).toFixed(2)} ({pg.formaPagamentoNome}) {pg.escritorioResponsavel ? '[Fiado Empresa]' : ''}
                                                </div>
                                            ))}
                                        </div>
                                    ) : <span className="text-gray-400 italic">Sem valor apurado na doca.</span>}

                                    {entrega.itensDevolvidos?.length > 0 && (
                                        <div className="mt-2 border-t pt-1 space-y-1">
                                            <strong className="text-red-600">Devolvidos p/ Câmara:</strong>
                                            {entrega.itensDevolvidos.map(it => (
                                                <div key={it.id} className="text-gray-600">
                                                    - {it.quantidade}x {it.produto?.nome} (Desconto: R$ {(Number(it.quantidade) * Number(it.valorBaseItem)).toFixed(2)})
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button
                                        onClick={() => handleEstorno(entrega.id, entrega.cliente?.NomeFantasia)}
                                        className="text-red-600 hover:text-red-900 bg-red-50 p-2 rounded-md transition-colors"
                                        title="Estornar (Undo) Pagamento e Devoluções = Volta a ser PENDENTE no Caminhão"
                                    >
                                        Estornar Baixa
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AuditoriaEntregas;
