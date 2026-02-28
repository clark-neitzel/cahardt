import React, { useState, useEffect } from 'react';
import tabelaPrecoService from '../../services/tabelaPrecoService';
import { BadgeDollarSign, Calendar, Landmark, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

const TabelaPrecos = () => {
    const [condicoes, setCondicoes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});

    useEffect(() => {
        carregarDados();
    }, []);

    const carregarDados = async () => {
        try {
            setLoading(true);
            const dados = await tabelaPrecoService.listar();
            setCondicoes(dados);
        } catch (error) {
            toast.error('Erro ao carregar tabela de preços');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleEditClick = (item) => {
        setEditingId(item.id);
        setEditForm({
            acrescimoPreco: item.acrescimoPreco || 0,
            valorMinimo: item.valorMinimo || 0,
            ativo: item.ativo
        });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditForm({});
    };

    const handleSaveEdit = async (id) => {
        try {
            setSavingId(id);
            const updated = await tabelaPrecoService.atualizar(id, editForm);

            // Atualizar lista local
            setCondicoes(condicoes.map(c => c.id === id ? { ...c, ...updated } : c));

            toast.success('Condição atualizada com sucesso');
            setEditingId(null);
        } catch (error) {
            console.error(error);
            toast.error('Erro ao atualizar condição');
        } finally {
            setSavingId(null);
        }
    };

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <BadgeDollarSign className="h-8 w-8 text-primary" />
                    Tabela de Preços e Condições
                </h1>
                <div className="text-sm text-gray-500">
                    Total: {condicoes.length} registros
                </div>
            </div>

            {loading ? (
                <div className="text-center py-10 text-gray-500">Carregando dados...</div>
            ) : (
                <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descrição (Nome)</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo / Opção</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Dias</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acréscimo (%)</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor Mínimo (R$)</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Regras / Banco</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {condicoes.map((item) => {
                                const isEditing = editingId === item.id;

                                return (
                                    <tr key={item.id} className={isEditing ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            {item.id}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                            <div className="font-semibold text-gray-900">{item.nomeCondicao}</div>
                                            <div className="text-xs text-gray-500">{item.idCondicao}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            <div>{item.tipoPagamento || '-'}</div>
                                            <div className="text-xs text-gray-400">{item.opcaoCondicao}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                                            {item.parcelasDias} dias
                                            <div className="text-xs text-gray-400">({item.qtdParcelas}x)</div>
                                        </td>

                                        {/* COLUNA: ACRÉSCIMO */}
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className="w-24 block border border-gray-300 rounded-md shadow-sm p-2 bg-white text-gray-900 focus:ring-primary focus:border-primary text-sm"
                                                    value={editForm.acrescimoPreco}
                                                    onChange={(e) => setEditForm({ ...editForm, acrescimoPreco: e.target.value })}
                                                />
                                            ) : (
                                                item.acrescimoPreco > 0 ? (
                                                    <span className="text-red-600 font-medium">+{item.acrescimoPreco}%</span>
                                                ) : (
                                                    <span className="text-emerald-600 font-medium">Sem acréscimo</span>
                                                )
                                            )}
                                        </td>

                                        {/* COLUNA: VALOR MÍNIMO */}
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {isEditing ? (
                                                <div className="relative rounded-md shadow-sm w-32">
                                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                        <span className="text-gray-500 sm:text-sm">R$</span>
                                                    </div>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        className="w-full pl-9 block border border-gray-300 rounded-md shadow-sm p-2 bg-white text-gray-900 focus:ring-primary focus:border-primary text-sm"
                                                        value={editForm.valorMinimo}
                                                        onChange={(e) => setEditForm({ ...editForm, valorMinimo: e.target.value })}
                                                    />
                                                </div>
                                            ) : (
                                                <span className={item.valorMinimo > 0 ? "font-semibold text-primary" : "text-gray-400"}>
                                                    {item.valorMinimo > 0 ? formatCurrency(item.valorMinimo) : 'Retalho (R$ 0,00)'}
                                                </span>
                                            )}
                                        </td>

                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {item.exigeBanco && (
                                                <div className="flex items-center gap-1 text-orange-600 text-xs" title="Exige Banco Padrão">
                                                    <Landmark className="h-4 w-4" />
                                                    Exige Banco
                                                </div>
                                            )}
                                            {item.bancoPadrao && (
                                                <div className="text-xs text-gray-400 mt-1 truncate max-w-[100px]" title={item.bancoPadrao}>
                                                    ID: {item.bancoPadrao}
                                                </div>
                                            )}
                                        </td>

                                        {/* COLUNA: STATUS */}
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {isEditing ? (
                                                <select
                                                    className="block w-28 border border-gray-300 rounded-md shadow-sm p-2 bg-white text-gray-900 focus:ring-primary focus:border-primary text-sm font-medium"
                                                    value={editForm.ativo ? 'true' : 'false'}
                                                    onChange={(e) => setEditForm({ ...editForm, ativo: e.target.value === 'true' })}
                                                >
                                                    <option value="true">✅ Ativo</option>
                                                    <option value="false">❌ Inativo</option>
                                                </select>
                                            ) : (
                                                <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full border ${item.ativo ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
                                                    {item.ativo ? 'Ativo' : 'Inativo'}
                                                </span>
                                            )}
                                        </td>

                                        {/* COLUNA: AÇÕES */}
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            {isEditing ? (
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={handleCancelEdit}
                                                        className="text-gray-500 hover:text-gray-700 bg-white border border-gray-300 px-3 py-1.5 rounded disabled:opacity-50 transition-colors"
                                                        disabled={savingId === item.id}
                                                    >
                                                        Cancelar
                                                    </button>
                                                    <button
                                                        onClick={() => handleSaveEdit(item.id)}
                                                        className="text-white bg-primary hover:bg-blue-700 px-3 py-1.5 rounded shadow-sm disabled:opacity-50 transition-colors"
                                                        disabled={savingId === item.id}
                                                    >
                                                        {savingId === item.id ? 'Sal... ' : 'Salvar'}
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => handleEditClick(item)}
                                                    className="text-primary hover:text-blue-900 font-medium bg-blue-50 px-3 py-1.5 rounded-md hover:bg-blue-100 transition-colors"
                                                >
                                                    Editar
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default TabelaPrecos;
