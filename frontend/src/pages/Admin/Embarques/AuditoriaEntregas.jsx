import React, { useState, useEffect } from 'react';
import { AlertTriangle, Truck, Pencil, X, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../services/api';

const AuditoriaEntregas = () => {
    const [entregas, setEntregas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filtroDivergente, setFiltroDivergente] = useState(false);
    const [embarqueIdFilter, setEmbarqueIdFilter] = useState('');
    const hojeISO = new Date().toISOString().slice(0, 10);
    const [dataFilter, setDataFilter] = useState(hojeISO);
    const [motoristaFilter, setMotoristaFilter] = useState('');
    const [clienteFilter, setClienteFilter] = useState('');

    const [editandoEntrega, setEditandoEntrega] = useState(null);
    const [editPagamentos, setEditPagamentos] = useState([]);
    const [formasPagamento, setFormasPagamento] = useState([]);
    const [salvandoEdicao, setSalvandoEdicao] = useState(false);

    const fetchAuditoria = async () => {
        try {
            setLoading(true);
            const params = {};
            if (filtroDivergente) params.divergente = true;
            if (embarqueIdFilter) params.embarqueId = embarqueIdFilter;
            if (dataFilter) params.data = dataFilter;
            if (motoristaFilter) params.motorista = motoristaFilter;
            if (clienteFilter) params.cliente = clienteFilter;

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
        const t = setTimeout(fetchAuditoria, 300);
        return () => clearTimeout(t);
    }, [filtroDivergente, embarqueIdFilter, dataFilter, motoristaFilter, clienteFilter]);

    const abrirEdicao = async (entrega) => {
        if (formasPagamento.length === 0) {
            try {
                const res = await api.get('/pagamentos-entrega');
                setFormasPagamento(res.data.filter(f => f.ativo));
            } catch {
                toast.error('Erro ao carregar formas de pagamento.');
                return;
            }
        }
        setEditPagamentos(
            entrega.pagamentosReais?.length > 0
                ? entrega.pagamentosReais.map(pg => ({
                    formaPagamentoEntregaId: pg.formaPagamentoEntregaId || '',
                    formaPagamentoNome: pg.formaPagamentoNome,
                    valor: String(Number(pg.valor).toFixed(2)),
                    escritorioResponsavel: pg.escritorioResponsavel || false,
                }))
                : [{ formaPagamentoEntregaId: '', formaPagamentoNome: '', valor: '', escritorioResponsavel: false }]
        );
        setEditandoEntrega(entrega);
    };

    const handleSalvarEdicao = async () => {
        const pagamentos = editPagamentos
            .filter(p => p.formaPagamentoNome && Number(p.valor) > 0)
            .map(p => ({
                formaPagamentoEntregaId: p.formaPagamentoEntregaId || null,
                formaPagamentoNome: p.formaPagamentoNome,
                valor: Number(p.valor),
                escritorioResponsavel: p.escritorioResponsavel,
            }));

        if (pagamentos.length === 0) {
            toast.error('Informe ao menos um pagamento válido.');
            return;
        }

        setSalvandoEdicao(true);
        try {
            await api.patch(`/entregas/${editandoEntrega.id}/editar`, { pagamentos });
            toast.success('Pagamento atualizado com sucesso!');
            setEditandoEntrega(null);
            fetchAuditoria();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao salvar alteração.');
        } finally {
            setSalvandoEdicao(false);
        }
    };

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
        <div className="w-full py-4 md:py-8 px-3 md:px-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 md:mb-6 gap-2">
                <div>
                    <h1 className="text-lg md:text-2xl font-bold text-gray-900 flex items-center">
                        <AlertTriangle className="h-5 w-5 md:h-6 md:w-6 text-amber-500 mr-2" />
                        Auditoria Logística
                    </h1>
                    <p className="mt-0.5 text-xs md:text-sm text-gray-500">
                        Monitoramento contábil e reversão de viagens finalizadas.
                    </p>
                </div>
            </div>

            {/* Filtros */}
            <div className="bg-white p-3 md:p-4 rounded-t-lg shadow-sm border-b space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3">
                    <div>
                        <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">Data</label>
                        <input
                            type="date"
                            className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                            value={dataFilter}
                            onChange={(e) => setDataFilter(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">Embarque</label>
                        <input
                            type="text"
                            placeholder="ID"
                            className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                            value={embarqueIdFilter}
                            onChange={(e) => setEmbarqueIdFilter(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">Motorista</label>
                        <input
                            type="text"
                            placeholder="Nome"
                            className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                            value={motoristaFilter}
                            onChange={(e) => setMotoristaFilter(e.target.value)}
                        />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                        <label className="block text-[10px] uppercase font-semibold text-gray-500 mb-1">Cliente</label>
                        <input
                            type="text"
                            placeholder="Nome/Fantasia"
                            className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                            value={clienteFilter}
                            onChange={(e) => setClienteFilter(e.target.value)}
                        />
                    </div>
                    <div className="col-span-2 md:col-span-1 flex items-end">
                        <button
                            type="button"
                            onClick={() => { setDataFilter(''); setEmbarqueIdFilter(''); setMotoristaFilter(''); setClienteFilter(''); setFiltroDivergente(false); }}
                            className="w-full px-2 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-md"
                        >
                            Limpar filtros
                        </button>
                    </div>
                </div>
                <label className="flex items-center cursor-pointer">
                    <input
                        type="checkbox"
                        className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded"
                        checked={filtroDivergente}
                        onChange={(e) => setFiltroDivergente(e.target.checked)}
                    />
                    <span className="ml-2 text-[12px] md:text-sm text-gray-900 font-medium">
                        Apenas Divergências
                    </span>
                </label>
            </div>

            {/* Desktop: Tabela */}
            <div className="hidden md:block bg-white shadow rounded-b-lg">
                <table className="w-full table-fixed divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="w-[11%] px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Data</th>
                            <th className="w-[10%] px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Viagem / Resp.</th>
                            <th className="w-[22%] px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">NF / Cliente</th>
                            <th className="w-[10%] px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                            <th className="w-[37%] px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Caixa / Devoluções</th>
                            <th className="w-[10%] px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200 text-sm">
                        {loading ? (
                            <tr><td colSpan="6" className="px-6 py-8 text-center text-gray-500">Varrendo histórico logístico...</td></tr>
                        ) : entregas.length === 0 ? (
                            <tr><td colSpan="6" className="px-6 py-8 text-center text-gray-500">Nenhuma viagem finalizada encontrada.</td></tr>
                        ) : entregas.map((entrega) => (
                            <tr key={entrega.id} className={entrega.divergenciaPagamento ? "bg-amber-50" : "hover:bg-gray-50"}>
                                <td className="px-4 py-4 text-gray-500 text-xs">
                                    {new Date(entrega.dataEntrega).toLocaleString('pt-BR')}
                                </td>
                                <td className="px-4 py-4 text-gray-900 font-medium">
                                    <div className="flex flex-col">
                                        <span className="flex items-center font-mono"><Truck className="h-3 w-3 mr-1" /> #{entrega.embarque?.numero}</span>
                                        <span className="text-xs text-gray-500">{entrega.embarque?.responsavel?.nome}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-4">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-gray-900 break-words">{entrega.cliente?.NomeFantasia || entrega.cliente?.Nome || <span className="text-gray-400 italic font-normal">Sem cadastro</span>}</span>
                                        <span className="text-xs text-gray-500 font-mono">Ped CA: {entrega.numero || 'S/N'}</span>
                                    </div>
                                    {entrega.gpsEntrega && (
                                        <a href={`https://www.google.com/maps?q=${entrega.gpsEntrega}`} target="_blank" rel="noreferrer" className="text-[10px] text-sky-600 hover:underline inline-block mt-1">
                                            Ver no Mapa
                                        </a>
                                    )}
                                </td>
                                <td className="px-4 py-4 text-center">
                                    {entrega.statusEntrega === 'ENTREGUE' && <span className="px-2 py-1 text-xs font-bold bg-green-100 text-green-800 rounded-full">ENTREGUE</span>}
                                    {entrega.statusEntrega === 'ENTREGUE_PARCIAL' && <span className="px-2 py-1 text-xs font-bold bg-amber-100 text-amber-800 rounded-full">PARCIAL</span>}
                                    {entrega.statusEntrega === 'DEVOLVIDO' && <span className="px-2 py-1 text-xs font-bold bg-red-100 text-red-800 rounded-full">DEVOLVIDO</span>}
                                </td>
                                <td className="px-4 py-4 text-xs">
                                    {entrega.divergenciaPagamento && (
                                        <div className="text-amber-700 font-bold mb-1 flex items-center">
                                            <AlertTriangle className="h-3 w-3 mr-1" /> Divergência de Pagamento
                                        </div>
                                    )}
                                    {entrega.pagamentosReais?.length > 0 ? (
                                        <div className="space-y-1">
                                            {entrega.pagamentosReais.map(pg => (
                                                <div key={pg.id} className="text-green-700">
                                                    + R$ {Number(pg.valor).toFixed(2)} ({pg.formaPagamentoNome}) {pg.escritorioResponsavel ? '[Fiado]' : ''}
                                                </div>
                                            ))}
                                        </div>
                                    ) : <span className="text-gray-400 italic">Sem valor apurado.</span>}
                                    {entrega.itensDevolvidos?.length > 0 && (
                                        <div className="mt-2 border-t pt-1 space-y-1">
                                            <strong className="text-red-600">Devolvidos:</strong>
                                            {entrega.itensDevolvidos.map(it => (
                                                <div key={it.id} className="text-gray-600">
                                                    - {it.quantidade}x {it.produto?.nome} (R$ {(Number(it.quantidade) * Number(it.valorBaseItem)).toFixed(2)})
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </td>
                                <td className="px-4 py-4 text-right text-sm font-medium">
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            onClick={() => abrirEdicao(entrega)}
                                            className="text-sky-600 hover:text-sky-900 bg-sky-50 p-2 rounded-md transition-colors"
                                            title="Editar pagamento"
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </button>
                                        <button
                                            onClick={() => handleEstorno(entrega.id, entrega.cliente?.NomeFantasia)}
                                            className="text-red-600 hover:text-red-900 bg-red-50 p-2 rounded-md transition-colors"
                                        >
                                            Estornar
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile: Cards */}
            <div className="md:hidden space-y-2 mt-2">
                {loading ? (
                    <div className="text-center py-8 text-gray-500">Varrendo histórico...</div>
                ) : entregas.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">Nenhuma viagem encontrada.</div>
                ) : entregas.map(entrega => (
                    <div key={entrega.id} className={`bg-white rounded-xl border shadow-sm p-3 ${entrega.divergenciaPagamento ? 'border-amber-300 bg-amber-50/50' : 'border-gray-200'}`}>
                        <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {entrega.statusEntrega === 'ENTREGUE' && <span className="text-[10px] font-bold bg-green-100 text-green-800 px-1.5 py-0.5 rounded">ENTREGUE</span>}
                                {entrega.statusEntrega === 'ENTREGUE_PARCIAL' && <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">PARCIAL</span>}
                                {entrega.statusEntrega === 'DEVOLVIDO' && <span className="text-[10px] font-bold bg-red-100 text-red-800 px-1.5 py-0.5 rounded">DEVOLVIDO</span>}
                                <span className="text-[10px] text-gray-400 flex items-center gap-0.5 font-mono"><Truck className="h-3 w-3" />#{entrega.embarque?.numero}</span>
                            </div>
                            <span className="text-[10px] text-gray-400">{new Date(entrega.dataEntrega).toLocaleString('pt-BR')}</span>
                        </div>
                        <p className="font-bold text-[13px] text-gray-900">{entrega.cliente?.NomeFantasia || entrega.cliente?.Nome || <span className="text-gray-400 italic font-normal">Sem cadastro</span>}</p>
                        <p className="text-[11px] text-gray-500">{entrega.embarque?.responsavel?.nome}</p>

                        {entrega.divergenciaPagamento && (
                            <div className="text-[10px] font-bold text-amber-600 mt-1 flex items-center gap-0.5">
                                <AlertTriangle className="h-3 w-3" /> Divergência de Pagamento
                            </div>
                        )}

                        {entrega.pagamentosReais?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                                {entrega.pagamentosReais.map(pg => (
                                    <span key={pg.id} className="text-[10px] bg-green-50 text-green-700 px-1 py-0.5 rounded font-mono">
                                        {pg.formaPagamentoNome}: R$ {Number(pg.valor).toFixed(2)}
                                    </span>
                                ))}
                            </div>
                        )}

                        {entrega.itensDevolvidos?.length > 0 && (
                            <div className="mt-1.5 pt-1.5 border-t border-gray-100">
                                {entrega.itensDevolvidos.map(it => (
                                    <p key={it.id} className="text-[10px] text-red-600">- {it.quantidade}x {it.produto?.nome}</p>
                                ))}
                            </div>
                        )}

                        <div className="mt-2 flex gap-2">
                            <button
                                onClick={() => abrirEdicao(entrega)}
                                className="flex-1 text-[11px] font-semibold text-sky-600 bg-sky-50 py-1.5 rounded-lg border border-sky-200 flex items-center justify-center gap-1"
                            >
                                <Pencil className="h-3 w-3" /> Editar
                            </button>
                            <button
                                onClick={() => handleEstorno(entrega.id, entrega.cliente?.NomeFantasia)}
                                className="flex-1 text-[11px] font-semibold text-red-600 bg-red-50 py-1.5 rounded-lg border border-red-200"
                            >
                                Estornar
                            </button>
                        </div>
                    </div>
                ))}
            </div>

        {/* Modal Editar Pagamento */}
        {editandoEntrega && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
                    <div className="flex items-center justify-between px-5 py-4 border-b">
                        <div>
                            <h2 className="text-base font-bold text-gray-900">Editar Pagamentos</h2>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {editandoEntrega.cliente?.NomeFantasia || editandoEntrega.cliente?.Nome} — Ped CA: {editandoEntrega.numero}
                            </p>
                        </div>
                        <button onClick={() => setEditandoEntrega(null)} className="text-gray-400 hover:text-gray-600">
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="px-5 py-4 space-y-3 max-h-80 overflow-y-auto">
                        {editPagamentos.map((pg, idx) => (
                            <div key={idx} className="flex gap-2 items-start">
                                <div className="flex-1 space-y-1.5">
                                    <select
                                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                        value={pg.formaPagamentoEntregaId || pg.formaPagamentoNome}
                                        onChange={(e) => {
                                            const selected = formasPagamento.find(f => f.id === e.target.value);
                                            const updated = [...editPagamentos];
                                            updated[idx] = {
                                                ...updated[idx],
                                                formaPagamentoEntregaId: selected ? selected.id : '',
                                                formaPagamentoNome: selected ? selected.nome : e.target.value,
                                            };
                                            setEditPagamentos(updated);
                                        }}
                                    >
                                        <option value="">Selecionar forma...</option>
                                        {formasPagamento.map(f => (
                                            <option key={f.id} value={f.id}>{f.nome}</option>
                                        ))}
                                    </select>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="Valor (R$)"
                                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                        value={pg.valor}
                                        onChange={(e) => {
                                            const updated = [...editPagamentos];
                                            updated[idx] = { ...updated[idx], valor: e.target.value };
                                            setEditPagamentos(updated);
                                        }}
                                    />
                                </div>
                                <button
                                    onClick={() => setEditPagamentos(editPagamentos.filter((_, i) => i !== idx))}
                                    className="mt-1 text-red-400 hover:text-red-600 p-1"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                        <button
                            onClick={() => setEditPagamentos([...editPagamentos, { formaPagamentoEntregaId: '', formaPagamentoNome: '', valor: '', escritorioResponsavel: false }])}
                            className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-800 font-medium"
                        >
                            <Plus className="h-3.5 w-3.5" /> Adicionar pagamento
                        </button>
                    </div>

                    <div className="px-5 py-4 border-t flex justify-end gap-3">
                        <button
                            onClick={() => setEditandoEntrega(null)}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSalvarEdicao}
                            disabled={salvandoEdicao}
                            className="px-4 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 rounded-lg"
                        >
                            {salvandoEdicao ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
    );
};

export default AuditoriaEntregas;
