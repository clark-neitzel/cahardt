import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Trash2, Plus, Save, X } from 'lucide-react';
import categoriaClienteService from '../../services/categoriaClienteService';

const CategoriasCliente = () => {
    const [categorias, setCategorias] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({
        nome: '',
        descricao: '',
        cicloPadraoDias: 7,
        ativo: true
    });
    const [saving, setSaving] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const data = await categoriaClienteService.listar();
            setCategorias(data);
        } catch (error) {
            toast.error('Erro ao carregar categorias.');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateNew = () => {
        setIsCreating(true);
        setEditingId(null);
        setForm({
            nome: '',
            descricao: '',
            cicloPadraoDias: 7,
            ativo: true
        });
    };

    const handleEdit = (cat) => {
        setIsCreating(false);
        setEditingId(cat.id);
        setForm({ ...cat });
    };

    const handleCancel = () => {
        setIsCreating(false);
        setEditingId(null);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            setSaving(true);
            if (isCreating) {
                await categoriaClienteService.criar(form);
                toast.success('Categoria criada com sucesso!');
            } else {
                await categoriaClienteService.atualizar(editingId, form);
                toast.success('Categoria atualizada com sucesso!');
            }
            handleCancel();
            loadData();
        } catch (error) {
            toast.error(error?.response?.data?.error || 'Erro ao salvar categoria.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Tem certeza que deseja excluir esta categoria?')) return;
        try {
            await categoriaClienteService.deletar(id);
            toast.success('Categoria excluída com sucesso!');
            loadData();
        } catch (error) {
            toast.error('Erro ao excluir categoria.');
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Carregando categorias...</div>;

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Categorias de Cliente (Comercial)</h1>
                    <p className="text-gray-500 text-sm">Segmente clientes para definir comportamento e frequência de venda esperada.</p>
                </div>
                {!isCreating && !editingId && (
                    <button
                        onClick={handleCreateNew}
                        className="flex items-center px-4 py-2 bg-primary text-white rounded hover:bg-blue-700 transition"
                    >
                        <Plus className="h-5 w-5 mr-1" />
                        Nova Categoria
                    </button>
                )}
            </div>

            {(isCreating || editingId) && (
                <div className="bg-white p-6 rounded-lg shadow-md mb-8 border border-gray-200">
                    <h2 className="text-lg font-bold mb-4">{isCreating ? 'Nova Categoria' : 'Editar Categoria'}</h2>
                    <form onSubmit={handleSave} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                                <input
                                    type="text"
                                    required
                                    value={form.nome}
                                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                                    className="w-full border border-gray-300 rounded-md p-2 bg-white text-gray-900 focus:ring-primary focus:border-primary"
                                    placeholder="Ex: Curva A, Lanchonete Premium..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Ciclo Padrão (Dias)</label>
                                <input
                                    type="number"
                                    value={form.cicloPadraoDias}
                                    onChange={(e) => setForm({ ...form, cicloPadraoDias: parseInt(e.target.value) || 0 })}
                                    className="w-full border border-gray-300 rounded-md p-2 bg-white text-gray-900 focus:ring-primary focus:border-primary"
                                    min="1"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                            <textarea
                                value={form.descricao || ''}
                                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                                className="w-full border border-gray-300 rounded-md p-2 bg-white text-gray-900 focus:ring-primary focus:border-primary"
                                rows="2"
                            />
                        </div>
                        <div className="flex items-center space-x-6">
                            <label className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    checked={form.ativo}
                                    onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                                    className="h-4 w-4 text-primary bg-white focus:ring-primary border-gray-300 rounded"
                                />
                                <span className="text-gray-900 text-sm font-medium">Categoria Ativa</span>
                            </label>
                        </div>
                        <div className="flex justify-end space-x-3 pt-4 border-t">
                            <button
                                type="button"
                                onClick={handleCancel}
                                className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition"
                                disabled={saving}
                            >
                                <X className="h-5 w-5 inline mr-1" />
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                className="px-4 py-2 bg-primary text-white hover:bg-blue-700 rounded transition flex items-center"
                                disabled={saving}
                            >
                                <Save className="h-5 w-5 inline mr-1" />
                                {saving ? 'Salvando...' : 'Salvar'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="bg-white shadow overflow-hidden sm:rounded-md border border-gray-200">
                <ul className="divide-y divide-gray-200">
                    {categorias.length === 0 ? (
                        <li className="px-6 py-4 text-center text-gray-500">Nenhuma categoria cadastrada.</li>
                    ) : (
                        categorias.map((cat) => (
                            <li key={cat.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                                <div>
                                    <h3 className="text-sm font-bold text-gray-900 flex items-center">
                                        {cat.nome}
                                        {!cat.ativo && <span className="ml-2 px-2 py-0.5 text-xs bg-red-100 text-red-800 rounded">Inativo</span>}
                                    </h3>
                                    <p className="text-xs text-gray-500">{cat.descricao || 'Sem descrição'}</p>
                                </div>
                                <div className="flex items-center space-x-4">
                                    <div className="text-xs text-gray-500 text-right mr-4 whitespace-nowrap">
                                        Ciclo: {cat.cicloPadraoDias} dias
                                    </div>
                                    <button
                                        onClick={() => handleEdit(cat)}
                                        className="text-blue-600 hover:text-blue-900 p-1"
                                        title="Editar"
                                    >
                                        <Pencil className="h-5 w-5" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(cat.id)}
                                        className="text-red-600 hover:text-red-900 p-1"
                                        title="Excluir"
                                    >
                                        <Trash2 className="h-5 w-5" />
                                    </button>
                                </div>
                            </li>
                        ))
                    )}
                </ul>
            </div>
        </div>
    );
};

export default CategoriasCliente;
