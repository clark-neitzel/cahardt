import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Save, X, Trash2, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import formasPagamentoService from '../../services/formasPagamentoService';

const FormasPagamentoEntrega = () => {
    const [formas, setFormas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [isCreating, setIsCreating] = useState(false);

    const fetchFormas = async () => {
        try {
            setLoading(true);
            const data = await formasPagamentoService.listar();
            setFormas(data);
        } catch (error) {
            console.error('Erro ao buscar formas de pgto de entrega:', error);
            toast.error('Erro ao carregar as formas de pagamento logísticas.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFormas();
    }, []);

    const handleEdit = (forma) => {
        setEditingId(forma.id);
        setIsCreating(false);
        setEditForm({
            nome: forma.nome,
            permiteVendedorResponsavel: forma.permiteVendedorResponsavel,
            permiteEscritorioResponsavel: forma.permiteEscritorioResponsavel,
            ativo: forma.ativo
        });
    };

    const handleCreateNew = () => {
        setIsCreating(true);
        setEditingId('novo');
        setEditForm({
            nome: '',
            permiteVendedorResponsavel: false,
            permiteEscritorioResponsavel: false,
            ativo: true
        });
    };

    const handleCancel = () => {
        setEditingId(null);
        setIsCreating(false);
        setEditForm({});
    };

    const handleSave = async (id) => {
        if (!editForm.nome?.trim()) {
            return toast.error('Nome da forma de pagamento é obrigatório.');
        }

        try {
            if (isCreating) {
                const data = await formasPagamentoService.criar(editForm);
                setFormas([...formas, data]);
                toast.success('Forma Criada com Sucesso!');
            } else {
                const data = await formasPagamentoService.atualizar(id, editForm);
                setFormas(formas.map(f => f.id === id ? data : f));
                toast.success('Forma Atualizada!');
            }
            handleCancel();
        } catch (error) {
            console.error(error);
            toast.error(error.response?.data?.error || 'Erro ao salvar a forma de pagamento.');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Tem certeza? Se houver entregas antigas usando este meio de pagamento, a exclusão será bloqueada (recomendamos inativar no lugar de excluir).')) return;

        try {
            await formasPagamentoService.excluir(id);
            setFormas(formas.filter(f => f.id !== id));
            toast.success('Forma excluída.');
        } catch (error) {
            console.error(error);
            toast.error(error.response?.data?.error || 'Erro estrutural ao excluir.');
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Pagamentos em Rota (Entregador)</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Crie exceções de pagamento como "Fiado do Motorista", "Pix na base", "Responsabilidade Escritório", para baixar saldo da entrega.
                    </p>
                </div>
                <button
                    onClick={handleCreateNew}
                    disabled={isCreating}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                >
                    <Plus className="-ml-1 mr-2 h-5 w-5" />
                    Nova Forma de Pgto
                </button>
            </div>

            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/4">Nome Visível no App</th>
                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-1/5">Fiado na Conta do Motorista?</th>
                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-1/5">Responsabilidade do Escritório?</th>
                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-1/6">Ativo</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading && !isCreating ? (
                            <tr><td colSpan="5" className="px-6 py-4 text-center">Carregando...</td></tr>
                        ) : formas.length === 0 && !isCreating ? (
                            <tr><td colSpan="5" className="px-6 py-4 text-center text-gray-500">Nenhuma forma de recebimento extra configurada.</td></tr>
                        ) : null}

                        {isCreating && (
                            <tr className="bg-indigo-50 border-l-4 border-indigo-500">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <input
                                        type="text"
                                        className="border-gray-300 rounded px-2 py-1 w-full text-sm"
                                        placeholder="Ex: Deixou Dívida (Escritório)"
                                        value={editForm.nome}
                                        onChange={e => setEditForm({ ...editForm, nome: e.target.value })}
                                        autoFocus
                                    />
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                        checked={editForm.permiteVendedorResponsavel}
                                        onChange={e => setEditForm({ ...editForm, permiteVendedorResponsavel: e.target.checked })}
                                    />
                                    <p className="text-[10px] text-gray-500 mt-1">Abate do Flex dele?</p>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                        checked={editForm.permiteEscritorioResponsavel}
                                        onChange={e => setEditForm({ ...editForm, permiteEscritorioResponsavel: e.target.checked })}
                                    />
                                    <p className="text-[10px] text-gray-500 mt-1">Caixa Assinado Assumido?</p>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className="text-sm font-medium text-green-600 bg-green-100 px-2 py-1 rounded-full">Sim</span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <div className="flex justify-end space-x-2">
                                        <button onClick={() => handleSave('novo')} className="text-green-600 hover:text-green-900"><Save className="h-5 w-5" /></button>
                                        <button onClick={handleCancel} className="text-red-600 hover:text-red-900"><X className="h-5 w-5" /></button>
                                    </div>
                                </td>
                            </tr>
                        )}

                        {formas.map((forma) => (
                            <tr key={forma.id} className={!forma.ativo ? "bg-gray-50 opacity-70" : ""}>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {editingId === forma.id ? (
                                        <input
                                            type="text"
                                            className="border-gray-300 rounded px-2 py-1 w-full text-sm"
                                            value={editForm.nome}
                                            onChange={e => setEditForm({ ...editForm, nome: e.target.value })}
                                        />
                                    ) : (
                                        <div className="text-sm font-medium text-gray-900">{forma.nome}</div>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-center">
                                    {editingId === forma.id ? (
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                            checked={editForm.permiteVendedorResponsavel}
                                            onChange={e => setEditForm({ ...editForm, permiteVendedorResponsavel: e.target.checked })}
                                        />
                                    ) : (
                                        forma.permiteVendedorResponsavel
                                            ? <span className="inline-flex items-center text-amber-600 font-bold text-xs bg-amber-50 px-2 rounded"><ShieldAlert className="w-3 h-3 mr-1" /> Motorista Cobre</span>
                                            : <span className="text-gray-400 text-xs">-</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-center">
                                    {editingId === forma.id ? (
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                            checked={editForm.permiteEscritorioResponsavel}
                                            onChange={e => setEditForm({ ...editForm, permiteEscritorioResponsavel: e.target.checked })}
                                        />
                                    ) : (
                                        forma.permiteEscritorioResponsavel
                                            ? <span className="inline-flex items-center text-blue-600 font-bold text-xs bg-blue-50 px-2 rounded">Escritório Cobre</span>
                                            : <span className="text-gray-400 text-xs">-</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-center">
                                    {editingId === forma.id ? (
                                        <select
                                            className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                                            value={editForm.ativo}
                                            onChange={(e) => setEditForm({ ...editForm, ativo: e.target.value === 'true' })}
                                        >
                                            <option value="true">Ativo</option>
                                            <option value="false">Inativo</option>
                                        </select>
                                    ) : (
                                        forma.ativo
                                            ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Ativo</span>
                                            : <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Inativo</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    {editingId === forma.id ? (
                                        <div className="flex justify-end space-x-2">
                                            <button onClick={() => handleSave(forma.id)} className="text-green-600 hover:text-green-900"><Save className="h-5 w-5" /></button>
                                            <button onClick={handleCancel} className="text-red-600 hover:text-red-900"><X className="h-5 w-5" /></button>
                                        </div>
                                    ) : (
                                        <div className="flex justify-end space-x-3">
                                            <button onClick={() => handleEdit(forma)} className="text-indigo-600 hover:text-indigo-900"><Edit2 className="h-4 w-4" /></button>
                                            <button onClick={() => handleDelete(forma.id)} className="text-red-500 hover:text-red-800"><Trash2 className="h-4 w-4" /></button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default FormasPagamentoEntrega;
