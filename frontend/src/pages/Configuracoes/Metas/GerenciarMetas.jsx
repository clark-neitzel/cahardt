import React, { useState, useEffect } from 'react';
import axios from 'axios';
import dayjs from 'dayjs';
import { Pencil, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import MetaFormModal from './MetaFormModal';

const API_URL = import.meta.env.VITE_API_URL;

const GerenciarMetas = () => {
    const [mesAtual, setMesAtual] = useState(dayjs().format('YYYY-MM'));
    const [metas, setMetas] = useState([]);
    const [vendedores, setVendedores] = useState([]);
    const [loading, setLoading] = useState(false);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedMeta, setSelectedMeta] = useState(null);

    const getAuthHeader = () => ({
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });

    const fetchVendedores = async () => {
        try {
            const res = await axios.get(`${API_URL}/vendedores`, getAuthHeader());
            setVendedores(Array.isArray(res.data) ? res.data : []);
        } catch (error) {
            console.error("Erro ao carregar vendedores", error);
            toast.error("Erro ao carregar vendedores");
        }
    };

    const fetchMetas = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}/metas?mesReferencia=${mesAtual}`, getAuthHeader());
            setMetas(Array.isArray(res.data) ? res.data : []);
        } catch (error) {
            console.error('Erro ao buscar metas:', error);
            toast.error("Erro ao buscar metas");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVendedores();
    }, []);

    useEffect(() => {
        fetchMetas();
    }, [mesAtual]);

    const handleEditClick = (metaData) => {
        setSelectedMeta(metaData);
        setIsModalOpen(true);
    };

    const handleNewClick = () => {
        setSelectedMeta(null);
        setIsModalOpen(true);
    };

    const handleModalClose = (saved) => {
        setIsModalOpen(false);
        if (saved) fetchMetas();
    };

    const formatCurrency = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    const parseDias = (v) => {
        const arr = typeof v === 'string' ? JSON.parse(v) : v;
        return arr ? `${arr.length} dias` : '0 dias';
    };

    return (
        <div className="container mx-auto p-4 sm:p-6 lg:p-8">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <h1 className="text-2xl font-bold text-gray-800">Gerenciar Metas de Vendas</h1>

                <div className="flex items-center gap-4">
                    <div>
                        <label className="text-sm text-gray-600 block mb-1">Mês de Referência</label>
                        <input
                            type="month"
                            className="border p-2 rounded shadow-sm focus:ring-blue-500 focus:border-blue-500"
                            value={mesAtual}
                            onChange={(e) => setMesAtual(e.target.value)}
                        />
                    </div>

                    <button
                        onClick={handleNewClick}
                        className="mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded shadow transition-colors flex items-center gap-2"
                    >
                        <Plus size={18} /> Nova Meta
                    </button>
                </div>
            </div>

            <div className="bg-white shadow-md rounded-lg overflow-hidden border border-gray-200">
                <div className="px-4 py-3 border-b bg-gray-50">
                    <h2 className="text-lg font-semibold text-gray-700">
                        Metas Definidas para {dayjs(mesAtual).format('MM/YYYY')}
                    </h2>
                </div>

                {loading ? (
                    <div className="p-8 text-center text-gray-500">Carregando...</div>
                ) : metas.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">Nenhuma meta definida para este mês.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                                <tr>
                                    <th className="px-4 py-3">Vendedor</th>
                                    <th className="px-4 py-3">Meta Mensal (R$)</th>
                                    <th className="px-4 py-3">Flex (R$)</th>
                                    <th className="px-4 py-3">Dias</th>
                                    <th className="px-4 py-3">Produtos</th>
                                    <th className="px-4 py-3">Promoções</th>
                                    <th className="px-4 py-3 text-center">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {metas.map((meta) => (
                                    <tr key={meta.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 font-medium">{meta.vendedor?.nome || '-'}</td>
                                        <td className="px-4 py-3">{formatCurrency(meta.valorMensal)}</td>
                                        <td className="px-4 py-3">{Number(meta.flexMensal) > 0 ? formatCurrency(meta.flexMensal) : '-'}</td>
                                        <td className="px-4 py-3">{parseDias(meta.diasTrabalho)}</td>
                                        <td className="px-4 py-3">
                                            {meta.metasProdutos?.length > 0 ? (
                                                <span className="text-green-700 bg-green-50 px-2 py-0.5 rounded text-xs font-medium">{meta.metasProdutos.length} prod.</span>
                                            ) : <span className="text-gray-400">-</span>}
                                        </td>
                                        <td className="px-4 py-3">
                                            {meta.metasPromocoes?.length > 0 ? (
                                                <span className="text-purple-700 bg-purple-50 px-2 py-0.5 rounded text-xs font-medium">{meta.metasPromocoes.length} promo.</span>
                                            ) : <span className="text-gray-400">-</span>}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                onClick={() => handleEditClick(meta)}
                                                className="text-blue-600 hover:text-blue-800 p-1"
                                                title="Editar"
                                            >
                                                <Pencil size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
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
