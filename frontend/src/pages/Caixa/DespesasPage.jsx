import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import despesaService from '../../services/despesaService';
import api from '../../services/api';
import NovaDespesaModal from './NovaDespesaModal';
import { Plus, Trash2, Edit, Fuel, Hotel, Wrench, DollarSign, ReceiptText, CircleEllipsis, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

const SESSION_KEY = '@CAHardt:CaixaFiltros';

const CATEGORIA_CONFIG = {
    MERCADORIA_EMPRESA: { label: 'Mercadoria', icon: ReceiptText, color: 'bg-blue-100 text-blue-700' },
    COMBUSTIVEL: { label: 'Combustível', icon: Fuel, color: 'bg-orange-100 text-orange-700' },
    PEDAGIO_BALSA: { label: 'Pedágio/Balsa', icon: DollarSign, color: 'bg-purple-100 text-purple-700' },
    HOTEL_HOSPEDAGEM: { label: 'Hotel', icon: Hotel, color: 'bg-teal-100 text-teal-700' },
    MANUTENCAO_VEICULO: { label: 'Manutenção', icon: Wrench, color: 'bg-red-100 text-red-700' },
    OUTRO: { label: 'Outro', icon: CircleEllipsis, color: 'bg-gray-100 text-gray-700' }
};

const DespesasPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const isAdmin = user?.permissoes?.admin || user?.permissoes?.Pode_Editar_Caixa;

    // Prioridade: URL params → sessão salva → defaults
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const urlData = searchParams.get('data');
    const urlVendedorId = searchParams.get('vendedorId');
    const fromCaixa = searchParams.get('from') === 'caixa';

    const getInitialData = () => {
        if (urlData) return urlData;
        try {
            const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
            return session.data || today;
        } catch { return today; }
    };

    const getInitialVendedor = () => {
        if (urlVendedorId !== null) return urlVendedorId;
        try {
            const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
            return session.vendedorId !== undefined ? session.vendedorId : (isAdmin ? '' : (user?.id || ''));
        } catch { return isAdmin ? '' : (user?.id || ''); }
    };

    const [data, setData] = useState(getInitialData);
    const [vendedorId] = useState(getInitialVendedor); // imutável: vem do contexto do caixa
    const [despesas, setDespesas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [despesaEditando, setDespesaEditando] = useState(null);
    const [veiculoDoDia, setVeiculoDoDia] = useState(null);

    // Persistir filtros na sessão sempre que mudarem
    useEffect(() => {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ data, vendedorId }));
    }, [data, vendedorId]);

    useEffect(() => {
        if (vendedorId && data) {
            fetchDespesas();
            api.get('/caixa/resumo', { params: { data, vendedorId } })
                .then(res => setVeiculoDoDia(res.data?.diario?.veiculoId || null))
                .catch(() => setVeiculoDoDia(null));
        }
    }, [vendedorId, data]);

    const fetchDespesas = async () => {
        try {
            setLoading(true);
            const res = await despesaService.listar(data, vendedorId);
            setDespesas(res || []);
        } catch (error) {
            console.error('Erro ao buscar despesas:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Excluir esta despesa?')) return;
        try {
            await despesaService.excluir(id);
            toast.success('Despesa excluída!');
            fetchDespesas();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao excluir.');
        }
    };

    const handleEdit = (despesa) => {
        setDespesaEditando(despesa);
        setShowModal(true);
    };

    const handleSaved = () => {
        setShowModal(false);
        setDespesaEditando(null);
        toast.success(despesaEditando ? 'Despesa atualizada!' : 'Despesa criada!');
        fetchDespesas();
    };

    const handleVoltar = () => {
        navigate('/caixa');
    };

    const totalDespesas = despesas.reduce((sum, d) => sum + Number(d.valor || 0), 0);

    const getCatConfig = (cat) => CATEGORIA_CONFIG[cat] || CATEGORIA_CONFIG.OUTRO;

    return (
        <div className="container mx-auto px-4 py-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div className="flex items-center gap-3">
                    {fromCaixa && (
                        <button
                            onClick={handleVoltar}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Voltar ao Caixa
                        </button>
                    )}
                    <h1 className="text-2xl font-bold text-gray-800">Despesas</h1>
                    {fromCaixa && (
                        <span className="text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                            {data}
                        </span>
                    )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    {/* Filtro de data: só exibe quando não veio do caixa direta */}
                    {!fromCaixa && (
                        <input
                            type="date"
                            value={data}
                            onChange={(e) => setData(e.target.value)}
                            className="border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm bg-white text-gray-900 focus:ring-primary focus:border-primary"
                        />
                    )}

                    <button
                        onClick={() => { setDespesaEditando(null); setShowModal(true); }}
                        className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-md shadow-sm text-sm font-medium hover:bg-blue-700"
                    >
                        <Plus className="h-4 w-4 mr-1" /> Nova Despesa
                    </button>
                </div>
            </div>

            {/* Card Total */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-center justify-between">
                <span className="text-sm font-medium text-amber-800">Total do Dia</span>
                <span className="text-xl font-bold text-amber-900">
                    R$ {totalDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hora</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Detalhe</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase w-24">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr>
                                <td colSpan="6" className="px-6 py-10 text-center text-gray-500">
                                    <div className="flex justify-center items-center">
                                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-2"></div>
                                        Carregando...
                                    </div>
                                </td>
                            </tr>
                        ) : despesas.length === 0 ? (
                            <tr>
                                <td colSpan="6" className="px-6 py-10 text-center text-gray-500">
                                    Nenhuma despesa neste dia.
                                </td>
                            </tr>
                        ) : (
                            despesas.map((d) => {
                                const cat = getCatConfig(d.categoria);
                                const Icon = cat.icon;
                                return (
                                    <tr key={d.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-3 text-sm text-gray-500">
                                            {new Date(d.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="px-6 py-3">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cat.color}`}>
                                                <Icon className="h-3 w-3 mr-1" />
                                                {cat.label}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-sm text-gray-900">{d.descricao || '—'}</td>
                                        <td className="px-6 py-3 text-xs text-gray-500">
                                            {d.categoria === 'COMBUSTIVEL' && d.litros && `${d.litros}L`}
                                            {d.categoria === 'COMBUSTIVEL' && d.kmNoAbastecimento && ` • ${d.kmNoAbastecimento} km`}
                                            {d.categoria === 'MANUTENCAO_VEICULO' && d.tipoManutencao && d.tipoManutencao}
                                        </td>
                                        <td className="px-6 py-3 text-sm font-bold text-gray-900 text-right">
                                            R$ {Number(d.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-6 py-3 text-right">
                                            <div className="flex justify-end space-x-2">
                                                <button onClick={() => handleEdit(d)} className="text-gray-400 hover:text-blue-600">
                                                    <Edit className="h-4 w-4" />
                                                </button>
                                                <button onClick={() => handleDelete(d.id)} className="text-gray-400 hover:text-red-600">
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
                {loading ? (
                    <div className="p-4 text-center text-gray-500">
                        <div className="flex justify-center items-center">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-2"></div>
                            Carregando...
                        </div>
                    </div>
                ) : despesas.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">Nenhuma despesa neste dia.</div>
                ) : (
                    despesas.map((d) => {
                        const cat = getCatConfig(d.categoria);
                        const Icon = cat.icon;
                        return (
                            <div key={d.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center space-x-3">
                                        <div className={`p-2 rounded-full ${cat.color}`}>
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cat.color}`}>
                                                {cat.label}
                                            </span>
                                            {d.descricao && (
                                                <p className="text-sm text-gray-600 mt-1">{d.descricao}</p>
                                            )}
                                            <p className="text-xs text-gray-400 mt-1">
                                                {new Date(d.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                {d.categoria === 'COMBUSTIVEL' && d.litros && ` • ${d.litros}L`}
                                                {d.categoria === 'COMBUSTIVEL' && d.kmNoAbastecimento && ` • ${d.kmNoAbastecimento} km`}
                                                {d.categoria === 'MANUTENCAO_VEICULO' && d.tipoManutencao && ` • ${d.tipoManutencao}`}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-base font-bold text-gray-900">
                                            R$ {Number(d.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                        <div className="flex space-x-2 mt-2 justify-end">
                                            <button onClick={() => handleEdit(d)} className="text-gray-400 hover:text-blue-600">
                                                <Edit className="h-4 w-4" />
                                            </button>
                                            <button onClick={() => handleDelete(d.id)} className="text-gray-400 hover:text-red-600">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {showModal && (
                <NovaDespesaModal
                    onClose={() => { setShowModal(false); setDespesaEditando(null); }}
                    onSaved={handleSaved}
                    vendedorId={vendedorId}
                    dataReferencia={data}
                    despesaEditando={despesaEditando}
                    veiculoDoDia={veiculoDoDia}
                />
            )}
        </div>
    );
};

export default DespesasPage;
