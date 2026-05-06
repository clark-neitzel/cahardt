import React, { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import { Pencil, Plus, Trash2, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import MetaFormModal from './MetaFormModal';

dayjs.locale('pt-br');

const STORAGE_KEY_MES = 'gerenciar_metas_mes';

const fmt = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const GerenciarMetas = () => {
    const { user } = useAuth();
    const permissoes = user?.permissoes || {};
    const podeGerenciar = !!permissoes.Pode_Gerenciar_Metas || !!permissoes.admin;

    const [mesAtual, setMesAtual] = useState(
        () => localStorage.getItem(STORAGE_KEY_MES) || dayjs().format('YYYY-MM')
    );
    const [metas, setMetas] = useState([]);
    const [vendedores, setVendedores] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedMeta, setSelectedMeta] = useState(null);

    const handleMesChange = (valor) => {
        setMesAtual(valor);
        localStorage.setItem(STORAGE_KEY_MES, valor);
    };

    const fetchVendedores = async () => {
        try {
            const res = await api.get('/vendedores');
            setVendedores(Array.isArray(res.data) ? res.data : []);
        } catch (error) {
            toast.error("Erro ao carregar vendedores");
        }
    };

    const fetchMetas = async () => {
        setLoading(true);
        try {
            const res = await api.get('/metas', { params: { mesReferencia: mesAtual } });
            setMetas(Array.isArray(res.data) ? res.data : []);
        } catch (error) {
            toast.error("Erro ao buscar metas");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchVendedores(); }, []);
    useEffect(() => { fetchMetas(); }, [mesAtual]);

    const handleModalClose = (saved) => {
        setIsModalOpen(false);
        if (saved) fetchMetas();
    };

    const handleExcluir = async (meta) => {
        const nome = meta.vendedor?.nome || 'vendedor';
        if (!window.confirm(`Excluir meta de ${nome} para ${dayjs(mesAtual + '-01').format('MM/YYYY')}?`)) return;
        try {
            await api.delete(`/metas/${meta.id}`);
            toast.success('Meta excluída');
            fetchMetas();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao excluir meta');
        }
    };

    const parseDias = (v) => {
        const arr = typeof v === 'string' ? JSON.parse(v) : v;
        return arr ? arr.length : 0;
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Metas de Vendas</h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {dayjs(mesAtual + '-01').format('MMMM [de] YYYY')} — {metas.length} meta{metas.length !== 1 ? 's' : ''} definida{metas.length !== 1 ? 's' : ''}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Mês de referência</label>
                        <input
                            type="month"
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            value={mesAtual}
                            onChange={(e) => handleMesChange(e.target.value)}
                        />
                    </div>
                    {podeGerenciar && (
                        <button
                            onClick={() => { setSelectedMeta(null); setIsModalOpen(true); }}
                            className="mt-5 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg shadow-sm flex items-center gap-2 text-sm"
                        >
                            <Plus size={16} /> Nova Meta
                        </button>
                    )}
                </div>
            </div>

            {/* Tabela */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-gray-400">Carregando...</div>
                ) : metas.length === 0 ? (
                    <div className="p-12 text-center">
                        <p className="text-gray-400 text-sm">Nenhuma meta definida para {dayjs(mesAtual + '-01').format('MM/YYYY')}.</p>
                        {podeGerenciar && (
                            <button
                                onClick={() => { setSelectedMeta(null); setIsModalOpen(true); }}
                                className="mt-3 text-blue-600 text-sm hover:underline"
                            >
                                Criar primeira meta
                            </button>
                        )}
                    </div>
                ) : (
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide border-b">
                            <tr>
                                <th className="px-5 py-3">Vendedor</th>
                                <th className="px-5 py-3">Meta mensal</th>
                                <th className="px-5 py-3">Flex</th>
                                <th className="px-5 py-3">Dias</th>
                                <th className="px-5 py-3">Produtos</th>
                                <th className="px-5 py-3">Cidades</th>
                                <th className="px-5 py-3">Promoções</th>
                                <th className="px-5 py-3 text-center w-24">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {metas.map((meta) => (
                                <tr key={meta.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-5 py-3 font-medium text-gray-800">{meta.vendedor?.nome || '-'}</td>
                                    <td className="px-5 py-3 font-semibold text-gray-800">{fmt(meta.valorMensal)}</td>
                                    <td className="px-5 py-3 text-gray-500">
                                        {Number(meta.flexMensal) > 0 ? fmt(meta.flexMensal) : <span className="text-gray-300">—</span>}
                                    </td>
                                    <td className="px-5 py-3 text-gray-600">{parseDias(meta.diasTrabalho)} dias</td>
                                    <td className="px-5 py-3">
                                        {meta.metasProdutos?.length > 0
                                            ? <span className="bg-green-50 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">{meta.metasProdutos.length} prod.</span>
                                            : <span className="text-gray-300">—</span>
                                        }
                                    </td>
                                    <td className="px-5 py-3">
                                        {meta.metasCidades?.length > 0
                                            ? (
                                                <span className="bg-orange-50 text-orange-700 text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 w-fit">
                                                    <MapPin size={10} />
                                                    {meta.metasCidades.length} cid.
                                                </span>
                                            )
                                            : <span className="text-gray-300">—</span>
                                        }
                                    </td>
                                    <td className="px-5 py-3">
                                        {meta.metasPromocoes?.length > 0
                                            ? <span className="bg-purple-50 text-purple-700 text-xs font-semibold px-2 py-0.5 rounded-full">{meta.metasPromocoes.length} promo.</span>
                                            : <span className="text-gray-300">—</span>
                                        }
                                    </td>
                                    <td className="px-5 py-3">
                                        <div className="flex items-center justify-center gap-1">
                                            {podeGerenciar && (
                                                <button
                                                    onClick={() => { setSelectedMeta(meta); setIsModalOpen(true); }}
                                                    className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50"
                                                    title="Editar"
                                                >
                                                    <Pencil size={15} />
                                                </button>
                                            )}
                                            {podeGerenciar && (
                                                <button
                                                    onClick={() => handleExcluir(meta)}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                                                    title="Excluir"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {isModalOpen && (
                <MetaFormModal
                    isOpen={isModalOpen}
                    onClose={handleModalClose}
                    metaData={selectedMeta}
                    vendedores={vendedores}
                    mesAtualStr={mesAtual}
                />
            )}
        </div>
    );
};

export default GerenciarMetas;
