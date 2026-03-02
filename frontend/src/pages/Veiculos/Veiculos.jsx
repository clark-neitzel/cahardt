import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Check, X, FileText, History } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../../services/api';

const Veiculos = () => {
    const [veiculos, setVeiculos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [veiculoHistorico, setVeiculoHistorico] = useState(null);
    const [formData, setFormData] = useState({
        id: null,
        placa: '',
        modelo: '',
        documentoUrl: '',
        ativo: true
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

    useEffect(() => {
        carregarVeiculos();
    }, []);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (formData.id) {
                await api.put(`/veiculos/${formData.id}`, formData);
                toast.success('Veículo atualizado com sucesso!');
            } else {
                await api.post('/veiculos', formData);
                toast.success('Veículo cadastrado com sucesso!');
            }
            setIsModalOpen(false);
            carregarVeiculos();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao salvar veículo');
        }
    };

    const openEdit = (veiculo) => {
        setFormData({
            id: veiculo.id,
            placa: veiculo.placa,
            modelo: veiculo.modelo,
            documentoUrl: veiculo.documentoUrl || '',
            ativo: veiculo.ativo
        });
        setIsModalOpen(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Tem certeza que deseja apagar este veículo? Dependendo do histórico, a melhor opção é inativá-lo.')) return;
        try {
            await api.delete(`/veiculos/${id}`);
            toast.success('Veículo excluído com sucesso');
            carregarVeiculos();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao excluir');
        }
    };

    // Caregar histórico de uso do veiculo
    const openHistory = async (veiculo) => {
        setVeiculoHistorico(null);
        setIsHistoryModalOpen(true);
        try {
            const { data } = await api.get(`/veiculos/${veiculo.id}`);
            setVeiculoHistorico(data);
        } catch (error) {
            toast.error('Erro ao buscar histórico desse veículo.');
            setIsHistoryModalOpen(false);
        }
    }

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        // DateString looks like 2026-03-02
        const parts = dateString.split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        return dateString;
    }

    if (loading) return <div className="p-8 text-center text-gray-500">Carregando veículos...</div>;

    return (
        <div className="bg-white rounded-lg shadow mt-4">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-center sm:items-start space-y-4 sm:space-y-0">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Veículos</h2>
                    <p className="text-sm text-gray-500 mt-1">Gerencie a frota de veículos e acompanhe o histórico de uso</p>
                </div>
                <button
                    onClick={() => {
                        setFormData({ id: null, placa: '', modelo: '', documentoUrl: '', ativo: true });
                        setIsModalOpen(true);
                    }}
                    className="flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark w-full sm:w-auto"
                >
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Veículo
                </button>
            </div>

            <div className="overflow-x-auto">
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
                                        <button onClick={() => openEdit(veiculo)} className="text-primary hover:text-primary-dark bg-blue-50 p-1.5 rounded-full" title="Editar Veículo">
                                            <Edit2 className="h-4 w-4" />
                                        </button>
                                        <button onClick={() => openHistory(veiculo)} className="text-gray-600 hover:text-gray-900 bg-gray-100 p-1.5 rounded-full" title="Histórico de Uso">
                                            <History className="h-4 w-4" />
                                        </button>
                                        <button onClick={() => handleDelete(veiculo.id)} className="text-red-600 hover:text-red-900 bg-red-50 p-1.5 rounded-full" title="Excluir Veículo">
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                                    {veiculo.placa}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                                    {veiculo.modelo}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {veiculo.documentoUrl ? (
                                        <a href={veiculo.documentoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center">
                                            <FileText className="h-4 w-4 mr-1" />
                                            Ver Documento
                                        </a>
                                    ) : (
                                        <span className="text-gray-400">Nenhum</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {veiculo.ativo ? (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                            <Check className="w-3 h-3 mr-1" /> Ativo
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                            <X className="w-3 h-3 mr-1" /> Inativo
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {veiculos.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                        Nenhum veículo cadastrado.
                    </div>
                )}
            </div>

            {/* Modal de Cadastro/Edição */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
                    <div className="relative p-5 border w-full max-w-lg shadow-lg rounded-md bg-white mx-4">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-medium text-gray-900">
                                {formData.id ? 'Editar Veículo' : 'Novo Veículo'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                                <X className="h-6 w-6" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Placa * (sem traços)</label>
                                <input
                                    type="text"
                                    name="placa"
                                    required
                                    value={formData.placa}
                                    onChange={handleChange}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50 uppercase"
                                    placeholder="AAA9A99"
                                    maxLength={7}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Modelo *</label>
                                <input
                                    type="text"
                                    name="modelo"
                                    required
                                    value={formData.modelo}
                                    onChange={handleChange}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                                    placeholder="Ex: Fiat Fiorino / Baú"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Link do Documento (opcional)</label>
                                <input
                                    type="url"
                                    name="documentoUrl"
                                    value={formData.documentoUrl}
                                    onChange={handleChange}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                                    placeholder="https://"
                                />
                                <p className="text-xs text-gray-500 mt-1">Insira uma URL pública ou de Drive do PDF do documento para fácil acesso dos motoristas.</p>
                            </div>
                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    name="ativo"
                                    id="ativo"
                                    checked={formData.ativo}
                                    onChange={handleChange}
                                    className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                                />
                                <label htmlFor="ativo" className="ml-2 block text-sm text-gray-900">
                                    Veículo em operação (Ativo)
                                </label>
                            </div>
                            <div className="mt-5 sm:flex sm:flex-row-reverse">
                                <button
                                    type="submit"
                                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary text-base font-medium text-white hover:bg-primary-dark sm:ml-3 sm:w-auto sm:text-sm"
                                >
                                    Salvar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 sm:mt-0 sm:w-auto sm:text-sm"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Histórico de Viagens Lateral (Slide over) */}
            {isHistoryModalOpen && (
                <div className="fixed inset-0 overflow-hidden z-[60]">
                    <div className="absolute inset-0 overflow-hidden">
                        <div className="absolute inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setIsHistoryModalOpen(false)} />

                        <div className="fixed inset-y-0 right-0 pl-10 max-w-full flex">
                            <div className="w-screen max-w-md">
                                <div className="h-full flex flex-col bg-white shadow-xl overflow-y-scroll">
                                    <div className="p-6 bg-primary">
                                        <div className="flex items-center justify-between">
                                            <h2 className="text-lg font-medium text-white">Histórico de Corridas</h2>
                                            <button onClick={() => setIsHistoryModalOpen(false)} className="text-gray-200 hover:text-white">
                                                <X className="h-6 w-6" />
                                            </button>
                                        </div>
                                        <div className="mt-1">
                                            <p className="text-sm text-primary-100">
                                                {veiculoHistorico ? `${veiculoHistorico.placa} - ${veiculoHistorico.modelo}` : 'Carregando...'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="relative flex-1 p-6">
                                        {!veiculoHistorico ? (
                                            <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
                                        ) : veiculoHistorico.diarios && veiculoHistorico.diarios.length > 0 ? (
                                            <div className="flow-root">
                                                <ul className="-mb-8">
                                                    {veiculoHistorico.diarios.map((diario, idx) => (
                                                        <li key={diario.id}>
                                                            <div className="relative pb-8">
                                                                {idx !== veiculoHistorico.diarios.length - 1 ? (
                                                                    <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true" />
                                                                ) : null}
                                                                <div className="relative flex space-x-3">
                                                                    <div>
                                                                        <span className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center ring-8 ring-white">
                                                                            <History className="h-4 w-4 text-blue-500" />
                                                                        </span>
                                                                    </div>
                                                                    <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                                                                        <div>
                                                                            <p className="text-sm text-gray-500">
                                                                                Vendedor: <span className="font-medium text-gray-900">{diario.vendedor?.nome || 'Desconhecido'}</span>
                                                                            </p>
                                                                            <div className="mt-2 text-sm text-gray-600 space-y-1 bg-gray-50 p-2 rounded border border-gray-100">
                                                                                <p>KM Início: <span className="font-mono">{diario.kmInicial || '-'}</span></p>
                                                                                <p>KM Fim: <span className="font-mono">{diario.kmFinal || '-'}</span></p>
                                                                                {diario.kmFinal && diario.kmInicial && (
                                                                                    <p className="text-primary font-bold">Resumo: +{diario.kmFinal - diario.kmInicial} km rodados</p>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        <div className="text-right text-sm whitespace-nowrap text-gray-500">
                                                                            <time dateTime={diario.dataReferencia}>{formatDate(diario.dataReferencia)}</time>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ) : (
                                            <div className="text-center text-gray-500 py-10">
                                                Nenhum histórico de viagem foi encontrado para este veículo.
                                            </div>
                                        )}
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
