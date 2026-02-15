import React, { useState, useEffect } from 'react';
import { Pencil, Save, X, Search, DollarSign, Mail } from 'lucide-react';

const ListaVendedores = () => {
    const [vendedores, setVendedores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});

    // Carregar vendedores
    const fetchVendedores = async () => {
        try {
            setLoading(true);
            const response = await fetch('http://localhost:3000/api/vendedores');
            // Hardcode localhost:3000 for now or use env if available. 
            // App.jsx doesn't seem to have global api config shown, but generally fetch goes to backend.
            // Using logic from ListaClientes (implied)
            const data = await response.json();
            setVendedores(data);
        } catch (error) {
            console.error('Erro ao buscar vendedores:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVendedores();
    }, []);

    const handleEdit = (vendedor) => {
        setEditingId(vendedor.id);
        setEditForm({
            email: vendedor.email || '',
            flexMensal: vendedor.flexMensal || 0,
            flexDisponivel: vendedor.flexDisponivel || 0
        });
    };

    const handleCancel = () => {
        setEditingId(null);
        setEditForm({});
    };

    const handleSave = async (id) => {
        try {
            const response = await fetch(`http://localhost:3000/api/vendedores/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm)
            });

            if (response.ok) {
                const updated = await response.json();
                setVendedores(vendedores.map(v => v.id === id ? updated : v));
                setEditingId(null);
            } else {
                alert('Erro ao salvar');
            }
        } catch (error) {
            console.error('Erro ao salvar:', error);
            alert('Erro ao conectar com servidor');
        }
    };

    const filtered = vendedores.filter(v =>
        v.nome.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Vendedores</h1>
                    <p className="mt-1 text-sm text-gray-500">Gerencie limites de Flex e dados de contato</p>
                </div>
                <div className="relative">
                    {/* Search logic optional but good */}
                </div>
            </div>

            {/* Tabela */}
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">E-mail</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Flex Mensal</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Flex Disponível</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr><td colSpan="5" className="px-6 py-4 text-center">Carregando...</td></tr>
                        ) : filtered.map(vendedor => (
                            <tr key={vendedor.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    {vendedor.nome}
                                    <div className="text-xs text-gray-400 font-mono mt-1">{vendedor.idLegado || '-'}</div>
                                </td>

                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {editingId === vendedor.id ? (
                                        <input
                                            className="border rounded px-2 py-1 w-full"
                                            value={editForm.email}
                                            onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                                            type="email"
                                        />
                                    ) : (
                                        <div className="flex items-center">
                                            <Mail className="h-4 w-4 mr-2 text-gray-400" />
                                            {vendedor.email || <span className="text-gray-300 italic">Sem e-mail</span>}
                                        </div>
                                    )}
                                </td>

                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {editingId === vendedor.id ? (
                                        <input
                                            className="border rounded px-2 py-1 w-24"
                                            value={editForm.flexMensal}
                                            onChange={e => setEditForm({ ...editForm, flexMensal: e.target.value })}
                                            type="number"
                                            step="0.01"
                                        />
                                    ) : (
                                        `R$ ${Number(vendedor.flexMensal).toFixed(2)}`
                                    )}
                                </td>

                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {editingId === vendedor.id ? (
                                        <input
                                            className="border rounded px-2 py-1 w-24"
                                            value={editForm.flexDisponivel}
                                            onChange={e => setEditForm({ ...editForm, flexDisponivel: e.target.value })}
                                            type="number"
                                            step="0.01"
                                        />
                                    ) : (
                                        `R$ ${Number(vendedor.flexDisponivel).toFixed(2)}`
                                    )}
                                </td>

                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    {editingId === vendedor.id ? (
                                        <div className="flex justify-end space-x-2">
                                            <button onClick={() => handleSave(vendedor.id)} className="text-green-600 hover:text-green-900"><Save className="h-4 w-4" /></button>
                                            <button onClick={handleCancel} className="text-red-600 hover:text-red-900"><X className="h-4 w-4" /></button>
                                        </div>
                                    ) : (
                                        <button onClick={() => handleEdit(vendedor)} className="text-primary hover:text-indigo-900">
                                            <Pencil className="h-4 w-4" />
                                        </button>
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

export default ListaVendedores;
