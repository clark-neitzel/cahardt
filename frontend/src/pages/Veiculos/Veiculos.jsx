import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Check, X, FileText, History, BellRing, Wrench } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../../services/api';

const Veiculos = () => {
    const [veiculos, setVeiculos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [veiculoHistorico, setVeiculoHistorico] = useState(null);
    const [isManutencaoOpen, setIsManutencaoOpen] = useState(false);
    const [manutencaoVeiculoId, setManutencaoVeiculoId] = useState(null);
    const [manutencaoVeiculoNome, setManutencaoVeiculoNome] = useState('');
    const [alertas, setAlertas] = useState([]);
    const [loadingAlertas, setLoadingAlertas] = useState(false);
    const [novoAlerta, setNovoAlerta] = useState({ tipo: '', descricao: '', kmAlerta: '', dataAlerta: '' });
    const [alertasPendentes, setAlertasPendentes] = useState({});
    const [formData, setFormData] = useState({
        id: null, placa: '', modelo: '', documentoUrl: '', ativo: true
    });

    const carregarVeiculos = async () => {
        try {
            const response = await api.get('/veiculos/admin/todos');
            setVeiculos(response.data);
        } catch (error) {
            toast.error('Erro ao carregar veículos');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { carregarVeiculos(); }, []);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (formData.id) {
                await api.put(`/veiculos/${formData.id}`, formData);
                toast.success('Veículo atualizado!');
            } else {
                await api.post('/veiculos', formData);
                toast.success('Veículo cadastrado!');
            }
            setIsModalOpen(false);
            carregarVeiculos();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao salvar veículo');
        }
    };

    const openEdit = (veiculo) => {
        setFormData({ id: veiculo.id, placa: veiculo.placa, modelo: veiculo.modelo, documentoUrl: veiculo.documentoUrl || '', ativo: veiculo.ativo });
        setIsModalOpen(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Tem certeza que deseja apagar este veículo?')) return;
        try {
            await api.delete(`/veiculos/${id}`);
            toast.success('Veículo excluído');
            carregarVeiculos();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao excluir');
        }
    };

    const openHistory = async (veiculo) => {
        setVeiculoHistorico(null);
        setIsHistoryModalOpen(true);
        try {
            const { data } = await api.get(`/veiculos/${veiculo.id}`);
            setVeiculoHistorico(data);
        } catch (error) {
            toast.error('Erro ao buscar histórico.');
            setIsHistoryModalOpen(false);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        const parts = dateString.split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        return dateString;
    };

    // Carregar alertas pendentes de todos os veículos
    useEffect(() => {
        api.get('/veiculos/alertas-pendentes').then(res => {
            const pending = {};
            (res.data || []).forEach(a => {
                if (!pending[a.veiculoId]) pending[a.veiculoId] = 0;
                pending[a.veiculoId]++;
            });
            setAlertasPendentes(pending);
        }).catch(() => {});
    }, []);

    const openManutencao = async (veiculo) => {
        setManutencaoVeiculoId(veiculo.id);
        setManutencaoVeiculoNome(`${veiculo.placa} — ${veiculo.modelo}`);
        setIsManutencaoOpen(true);
        setNovoAlerta({ tipo: '', descricao: '', kmAlerta: '', dataAlerta: '' });
        setLoadingAlertas(true);
        try {
            const res = await api.get(`/veiculos/${veiculo.id}/manutencao`);
            setAlertas(res.data || []);
        } catch {
            toast.error('Erro ao buscar manutenções.');
        } finally {
            setLoadingAlertas(false);
        }
    };

    const handleCriarAlerta = async (e) => {
        e.preventDefault();
        if (!novoAlerta.tipo) return;
        try {
            await api.post(`/veiculos/${manutencaoVeiculoId}/manutencao`, {
                tipo: novoAlerta.tipo,
                descricao: novoAlerta.descricao || null,
                kmAlerta: novoAlerta.kmAlerta ? parseInt(novoAlerta.kmAlerta) : null,
                dataAlerta: novoAlerta.dataAlerta || null
            });
            toast.success('Alerta criado!');
            setNovoAlerta({ tipo: '', descricao: '', kmAlerta: '', dataAlerta: '' });
            const res = await api.get(`/veiculos/${manutencaoVeiculoId}/manutencao`);
            setAlertas(res.data || []);
            setAlertasPendentes(prev => ({ ...prev, [manutencaoVeiculoId]: (prev[manutencaoVeiculoId] || 0) + 1 }));
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao criar alerta.');
        }
    };

    const handleConcluirAlerta = async (alertaId) => {
        try {
            await api.patch(`/veiculos/manutencao/${alertaId}/concluir`);
            toast.success('Alerta concluído!');
            const res = await api.get(`/veiculos/${manutencaoVeiculoId}/manutencao`);
            setAlertas(res.data || []);
            setAlertasPendentes(prev => ({ ...prev, [manutencaoVeiculoId]: Math.max(0, (prev[manutencaoVeiculoId] || 1) - 1) }));
        } catch {
            toast.error('Erro ao concluir alerta.');
        }
    };

    const TIPOS_MANUTENCAO = [
        { value: 'REVISAO', label: 'Revisão' },
        { value: 'RODIZIO_PNEUS', label: 'Rodízio de Pneus' },
        { value: 'TROCA_OLEO', label: 'Troca de Óleo' },
        { value: 'TROCA_FILTRO', label: 'Troca de Filtro' },
        { value: 'OUTRO', label: 'Outro' }
    ];

    if (loading) return <div className="p-8 text-center text-gray-500">Carregando veículos...</div>;

    return (
        <div className="bg-white rounded-lg shadow mt-4">
            <div className="p-3 md:p-6 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                    <h2 className="text-lg md:text-xl font-bold text-gray-900">Veículos</h2>
                    <p className="text-xs md:text-sm text-gray-500 mt-0.5">Gerencie a frota e acompanhe o histórico</p>
                </div>
                <button
                    onClick={() => { setFormData({ id: null, placa: '', modelo: '', documentoUrl: '', ativo: true }); setIsModalOpen(true); }}
                    className="flex items-center justify-center px-4 py-2 rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark w-full sm:w-auto"
                >
                    <Plus className="h-4 w-4 mr-2" /> Novo Veículo
                </button>
            </div>

            {/* Desktop: Tabela */}
            <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Placa</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Modelo</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Documento</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {veiculos.map(veiculo => (
                            <tr key={veiculo.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                    <div className="flex space-x-2">
                                        <button onClick={() => openEdit(veiculo)} className="text-primary bg-blue-50 p-1.5 rounded-full"><Edit2 className="h-4 w-4" /></button>
                                        <button onClick={() => openHistory(veiculo)} className="text-gray-600 bg-gray-100 p-1.5 rounded-full"><History className="h-4 w-4" /></button>
                                        <button onClick={() => openManutencao(veiculo)} className="relative text-amber-600 bg-amber-50 p-1.5 rounded-full">
                                            <Wrench className="h-4 w-4" />
                                            {alertasPendentes[veiculo.id] > 0 && (
                                                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                                                    {alertasPendentes[veiculo.id]}
                                                </span>
                                            )}
                                        </button>
                                        <button onClick={() => handleDelete(veiculo.id)} className="text-red-600 bg-red-50 p-1.5 rounded-full"><Trash2 className="h-4 w-4" /></button>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{veiculo.placa}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-gray-500">{veiculo.modelo}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {veiculo.documentoUrl ? (
                                        <a href={veiculo.documentoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center">
                                            <FileText className="h-4 w-4 mr-1" /> Ver Documento
                                        </a>
                                    ) : <span className="text-gray-400">Nenhum</span>}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    {veiculo.ativo ? (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800"><Check className="w-3 h-3 mr-1" /> Ativo</span>
                                    ) : (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800"><X className="w-3 h-3 mr-1" /> Inativo</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {veiculos.length === 0 && <div className="text-center py-12 text-gray-500">Nenhum veículo cadastrado.</div>}
            </div>

            {/* Mobile: Cards */}
            <div className="md:hidden p-3 space-y-2">
                {veiculos.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">Nenhum veículo cadastrado.</div>
                ) : veiculos.map(veiculo => (
                    <div key={veiculo.id} className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                        <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-[15px] text-gray-900 uppercase">{veiculo.placa}</span>
                                {veiculo.ativo ? (
                                    <span className="text-[10px] font-bold bg-green-100 text-green-800 px-1.5 py-0.5 rounded">Ativo</span>
                                ) : (
                                    <span className="text-[10px] font-bold bg-red-100 text-red-800 px-1.5 py-0.5 rounded">Inativo</span>
                                )}
                            </div>
                            <div className="flex gap-1">
                                <button onClick={() => openEdit(veiculo)} className="p-1.5 bg-blue-50 text-primary rounded-lg"><Edit2 className="h-4 w-4" /></button>
                                <button onClick={() => openHistory(veiculo)} className="p-1.5 bg-gray-100 text-gray-600 rounded-lg"><History className="h-4 w-4" /></button>
                                <button onClick={() => openManutencao(veiculo)} className="relative p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                                    <Wrench className="h-4 w-4" />
                                    {alertasPendentes[veiculo.id] > 0 && (
                                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                                            {alertasPendentes[veiculo.id]}
                                        </span>
                                    )}
                                </button>
                                <button onClick={() => handleDelete(veiculo.id)} className="p-1.5 bg-red-50 text-red-600 rounded-lg"><Trash2 className="h-4 w-4" /></button>
                            </div>
                        </div>
                        <p className="text-[12px] text-gray-500">{veiculo.modelo}</p>
                        {veiculo.documentoUrl && (
                            <a href={veiculo.documentoUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-600 flex items-center gap-0.5 mt-1">
                                <FileText className="h-3 w-3" /> Ver Documento
                            </a>
                        )}
                    </div>
                ))}
            </div>

            {/* Modal de Cadastro/Edição */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
                    <div className="relative p-5 border w-full max-w-lg shadow-lg rounded-md bg-white mx-4">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-medium text-gray-900">{formData.id ? 'Editar Veículo' : 'Novo Veículo'}</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-500"><X className="h-6 w-6" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Placa *</label>
                                <input type="text" name="placa" required value={formData.placa} onChange={handleChange}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50 uppercase" placeholder="AAA9A99" maxLength={7} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Modelo *</label>
                                <input type="text" name="modelo" required value={formData.modelo} onChange={handleChange}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50" placeholder="Ex: Fiat Fiorino / Baú" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Link do Documento (opcional)</label>
                                <input type="url" name="documentoUrl" value={formData.documentoUrl} onChange={handleChange}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50" placeholder="https://" />
                            </div>
                            <div className="flex items-center">
                                <input type="checkbox" name="ativo" id="ativo" checked={formData.ativo} onChange={handleChange}
                                    className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded" />
                                <label htmlFor="ativo" className="ml-2 block text-sm text-gray-900">Ativo</label>
                            </div>
                            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                                <button type="button" onClick={() => setIsModalOpen(false)}
                                    className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">Cancelar</button>
                                <button type="submit"
                                    className="w-full sm:w-auto px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Histórico */}
            {isHistoryModalOpen && (
                <div className="fixed inset-0 overflow-hidden z-[60]">
                    <div className="absolute inset-0 overflow-hidden">
                        <div className="absolute inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setIsHistoryModalOpen(false)} />
                        <div className="fixed inset-y-0 right-0 pl-0 md:pl-10 max-w-full flex">
                            <div className="w-screen max-w-md">
                                <div className="h-full flex flex-col bg-white shadow-xl overflow-y-scroll">
                                    <div className="p-4 md:p-6 bg-primary">
                                        <div className="flex items-center justify-between">
                                            <h2 className="text-base md:text-lg font-medium text-white">Histórico de Corridas</h2>
                                            <button onClick={() => setIsHistoryModalOpen(false)} className="text-gray-200 hover:text-white"><X className="h-6 w-6" /></button>
                                        </div>
                                        <p className="text-sm text-primary-100 mt-1">
                                            {veiculoHistorico ? `${veiculoHistorico.placa} - ${veiculoHistorico.modelo}` : 'Carregando...'}
                                        </p>
                                    </div>
                                    <div className="relative flex-1 p-4 md:p-6">
                                        {!veiculoHistorico ? (
                                            <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
                                        ) : veiculoHistorico.diarios && veiculoHistorico.diarios.length > 0 ? (
                                            <div className="flow-root">
                                                <ul className="-mb-8">
                                                    {veiculoHistorico.diarios.map((diario, idx) => (
                                                        <li key={diario.id}>
                                                            <div className="relative pb-8">
                                                                {idx !== veiculoHistorico.diarios.length - 1 && <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" />}
                                                                <div className="relative flex space-x-3">
                                                                    <span className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center ring-8 ring-white">
                                                                        <History className="h-4 w-4 text-blue-500" />
                                                                    </span>
                                                                    <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                                                                        <div>
                                                                            <p className="text-sm text-gray-500">
                                                                                Vendedor: <span className="font-medium text-gray-900">{diario.vendedor?.nome || 'Desconhecido'}</span>
                                                                            </p>
                                                                            <div className="mt-2 text-sm text-gray-600 space-y-1 bg-gray-50 p-2 rounded border border-gray-100">
                                                                                <p>KM Início: <span className="font-mono">{diario.kmInicial || '-'}</span></p>
                                                                                <p>KM Fim: <span className="font-mono">{diario.kmFinal || '-'}</span></p>
                                                                                {diario.kmFinal && diario.kmInicial && (
                                                                                    <p className="text-primary font-bold">+{diario.kmFinal - diario.kmInicial} km</p>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        <div className="text-right text-sm whitespace-nowrap text-gray-500">
                                                                            <time>{formatDate(diario.dataReferencia)}</time>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ) : (
                                            <div className="text-center text-gray-500 py-10">Nenhum histórico encontrado.</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal de Manutenção */}
            {isManutencaoOpen && (
                <div className="fixed inset-0 overflow-hidden z-[60]">
                    <div className="absolute inset-0 overflow-hidden">
                        <div className="absolute inset-0 bg-gray-500 bg-opacity-75" onClick={() => setIsManutencaoOpen(false)} />
                        <div className="fixed inset-y-0 right-0 pl-0 md:pl-10 max-w-full flex">
                            <div className="w-screen max-w-md">
                                <div className="h-full flex flex-col bg-white shadow-xl overflow-y-scroll">
                                    <div className="p-4 md:p-6 bg-amber-600">
                                        <div className="flex items-center justify-between">
                                            <h2 className="text-base md:text-lg font-medium text-white flex items-center">
                                                <Wrench className="h-5 w-5 mr-2" /> Manutenção
                                            </h2>
                                            <button onClick={() => setIsManutencaoOpen(false)} className="text-amber-200 hover:text-white"><X className="h-6 w-6" /></button>
                                        </div>
                                        <p className="text-sm text-amber-100 mt-1">{manutencaoVeiculoNome}</p>
                                    </div>

                                    <div className="flex-1 p-4 md:p-6 space-y-6">
                                        {/* Formulário Novo Alerta */}
                                        <form onSubmit={handleCriarAlerta} className="bg-amber-50 p-4 rounded-lg border border-amber-200 space-y-3">
                                            <h3 className="text-sm font-bold text-amber-900">Novo Alerta</h3>
                                            <select
                                                value={novoAlerta.tipo}
                                                onChange={(e) => setNovoAlerta(prev => ({ ...prev, tipo: e.target.value }))}
                                                className="w-full border border-gray-300 rounded-md p-2 text-sm"
                                                required
                                            >
                                                <option value="">Tipo de manutenção...</option>
                                                {TIPOS_MANUTENCAO.map(t => (
                                                    <option key={t.value} value={t.value}>{t.label}</option>
                                                ))}
                                            </select>
                                            <input
                                                type="text"
                                                placeholder="Descrição (opcional)"
                                                value={novoAlerta.descricao}
                                                onChange={(e) => setNovoAlerta(prev => ({ ...prev, descricao: e.target.value }))}
                                                className="w-full border border-gray-300 rounded-md p-2 text-sm"
                                            />
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-xs text-gray-600 mb-1">Alerta por KM</label>
                                                    <input
                                                        type="number"
                                                        placeholder="Ex: 150000"
                                                        value={novoAlerta.kmAlerta}
                                                        onChange={(e) => setNovoAlerta(prev => ({ ...prev, kmAlerta: e.target.value }))}
                                                        className="w-full border border-gray-300 rounded-md p-2 text-sm"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-600 mb-1">Alerta por Data</label>
                                                    <input
                                                        type="date"
                                                        value={novoAlerta.dataAlerta}
                                                        onChange={(e) => setNovoAlerta(prev => ({ ...prev, dataAlerta: e.target.value }))}
                                                        className="w-full border border-gray-300 rounded-md p-2 text-sm"
                                                    />
                                                </div>
                                            </div>
                                            <button type="submit" className="w-full px-4 py-2 bg-amber-600 text-white rounded-md text-sm font-medium hover:bg-amber-700">
                                                Criar Alerta
                                            </button>
                                        </form>

                                        {/* Lista de Alertas */}
                                        <div>
                                            <h3 className="text-sm font-bold text-gray-700 mb-3">Alertas Cadastrados</h3>
                                            {loadingAlertas ? (
                                                <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-600"></div></div>
                                            ) : alertas.length === 0 ? (
                                                <p className="text-center text-gray-400 py-6">Nenhum alerta cadastrado.</p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {alertas.map(a => (
                                                        <div key={a.id} className={`p-3 rounded-lg border ${a.concluido ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-amber-200'}`}>
                                                            <div className="flex items-start justify-between">
                                                                <div>
                                                                    <div className="flex items-center space-x-2">
                                                                        {a.concluido ? (
                                                                            <Check className="h-4 w-4 text-green-600" />
                                                                        ) : (
                                                                            <BellRing className="h-4 w-4 text-amber-600" />
                                                                        )}
                                                                        <span className="text-sm font-medium text-gray-900">{a.tipo?.replace(/_/g, ' ')}</span>
                                                                    </div>
                                                                    {a.descricao && <p className="text-xs text-gray-500 mt-1 ml-6">{a.descricao}</p>}
                                                                    <div className="text-xs text-gray-400 mt-1 ml-6 space-x-3">
                                                                        {a.kmAlerta && <span>KM: {a.kmAlerta.toLocaleString('pt-BR')}</span>}
                                                                        {a.dataAlerta && <span>Data: {new Date(a.dataAlerta).toLocaleDateString('pt-BR')}</span>}
                                                                    </div>
                                                                </div>
                                                                {!a.concluido && (
                                                                    <button
                                                                        onClick={() => handleConcluirAlerta(a.id)}
                                                                        className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded font-medium hover:bg-green-200"
                                                                    >
                                                                        Concluir
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Veiculos;
