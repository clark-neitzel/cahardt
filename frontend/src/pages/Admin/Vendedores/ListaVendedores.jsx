import React, { useState, useEffect } from 'react';
import { Pencil, Save, X, Search, DollarSign, Mail, Shield, Trash2 } from 'lucide-react';
import vendedorService from '../../../services/vendedorService';
import api from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import toast from 'react-hot-toast';
import PermissoesModal from './PermissoesModal';

const ListaVendedores = () => {
    const { user } = useAuth();
    const [vendedores, setVendedores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [permissionsModalVendedor, setPermissionsModalVendedor] = useState(null);
    const [resetting, setResetting] = useState(false);

    const isAdmin = !!user?.permissoes?.admin;

    const handleResetTransacional = async () => {
        if (!window.confirm('ATENÇÃO: Isso vai apagar TODOS os pedidos, entregas, embarques, visitas, despesas, metas, leads e histórico.\n\nCadastros (clientes, produtos, vendedores) serão mantidos.\n\nDeseja continuar?')) return;
        if (!window.confirm('TEM CERTEZA? Esta ação é IRREVERSÍVEL.')) return;

        setResetting(true);
        const toastId = toast.loading('Limpando dados transacionais...');
        try {
            const res = await api.delete('/admin/reset-transacional', {
                data: { confirmacao: 'CONFIRMO_RESET_TOTAL' }
            });
            toast.success('Dados limpos com sucesso!', { id: toastId });
            console.log('Reset resultado:', res.data.detalhes);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao executar reset', { id: toastId });
        } finally {
            setResetting(false);
        }
    };

    // Carregar vendedores
    const fetchVendedores = async () => {
        try {
            setLoading(true);
            const data = await vendedorService.listar();
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
            flexDisponivel: vendedor.flexDisponivel || 0,
            maxDescontoFlex: vendedor.maxDescontoFlex !== undefined ? vendedor.maxDescontoFlex : 100
        });
    };

    const handleCancel = () => {
        setEditingId(null);
        setEditForm({});
    };

    const handleSave = async (id) => {
        try {
            const updated = await vendedorService.atualizar(id, editForm);
            setVendedores(vendedores.map(v => v.id === id ? updated : v));
            setEditingId(null);
        } catch (error) {
            console.error('Erro ao salvar:', error);
            alert('Erro ao conectar com servidor');
        }
    };

    const filtered = vendedores.filter(v =>
        v.nome.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="max-w-7xl mx-auto px-3 md:px-6 lg:px-8 py-4 md:py-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 md:mb-6 gap-2">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900">Usuários</h1>
                    <p className="mt-0.5 text-xs md:text-sm text-gray-500">Gerencie limites de Flex e logísticas da equipe</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar vendedor..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full sm:w-48 pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-blue-400 outline-none"
                        />
                    </div>
                    {isAdmin && (
                        <button
                            onClick={handleResetTransacional}
                            disabled={resetting}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                        >
                            <Trash2 className="h-4 w-4" />
                            <span className="hidden sm:inline">Reset Dados</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Desktop: Tabela */}
            <div className="hidden md:block bg-white shadow overflow-hidden rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">E-mail</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Flex Mensal</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">% Máx. Desc.</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Flex Disponível</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr><td colSpan="6" className="px-6 py-4 text-center">Carregando...</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan="6" className="px-6 py-4 text-center text-gray-500">Nenhum usuário encontrado.</td></tr>
                        ) : filtered.map(vendedor => (
                            <tr key={vendedor.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    {vendedor.nome}
                                    <div className="text-xs text-gray-400 font-mono mt-1">{vendedor.idLegado || '-'}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {editingId === vendedor.id ? (
                                        <input className="border border-gray-300 rounded px-2 py-1 w-full bg-white text-gray-900" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} type="email" />
                                    ) : (
                                        <div className="flex items-center">
                                            <Mail className="h-4 w-4 mr-2 text-gray-400" />
                                            {vendedor.email || <span className="text-gray-300 italic">Sem e-mail</span>}
                                        </div>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {editingId === vendedor.id ? (
                                        <input className="border border-gray-300 rounded px-2 py-1 w-24 bg-white text-gray-900" value={editForm.flexMensal} onChange={e => setEditForm({ ...editForm, flexMensal: e.target.value })} type="number" step="0.01" />
                                    ) : `R$ ${Number(vendedor.flexMensal).toFixed(2)}`}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {editingId === vendedor.id ? (
                                        <div className="flex items-center">
                                            <input className="border border-gray-300 rounded px-2 py-1 w-20 bg-white text-gray-900" value={editForm.maxDescontoFlex} onChange={e => setEditForm({ ...editForm, maxDescontoFlex: e.target.value })} type="number" step="0.01" min="0" max="100" />
                                            <span className="ml-1">%</span>
                                        </div>
                                    ) : `${Number(vendedor.maxDescontoFlex !== undefined ? vendedor.maxDescontoFlex : 100).toFixed(0)}%`}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {editingId === vendedor.id ? (
                                        <input className="border border-gray-300 rounded px-2 py-1 w-24 bg-white text-gray-900" value={editForm.flexDisponivel} onChange={e => setEditForm({ ...editForm, flexDisponivel: e.target.value })} type="number" step="0.01" />
                                    ) : `R$ ${Number(vendedor.flexDisponivel).toFixed(2)}`}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    {editingId === vendedor.id ? (
                                        <div className="flex justify-end space-x-2">
                                            <button onClick={() => handleSave(vendedor.id)} className="text-green-600 hover:text-green-900"><Save className="h-4 w-4" /></button>
                                            <button onClick={handleCancel} className="text-red-600 hover:text-red-900"><X className="h-4 w-4" /></button>
                                        </div>
                                    ) : (
                                        <div className="flex justify-end space-x-2">
                                            <button onClick={() => setPermissionsModalVendedor(vendedor)} className="text-indigo-600 hover:text-indigo-900" title="Acessos e Permissões"><Shield className="h-4 w-4" /></button>
                                            <button onClick={() => handleEdit(vendedor)} className="text-primary hover:text-indigo-900"><Pencil className="h-4 w-4" /></button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile: Cards */}
            <div className="md:hidden space-y-2">
                {loading ? (
                    <div className="text-center py-8 text-gray-500">Carregando...</div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">Nenhum usuário encontrado.</div>
                ) : filtered.map(vendedor => (
                    <div key={vendedor.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <p className="font-bold text-[14px] text-gray-900">{vendedor.nome}</p>
                                <p className="text-[11px] text-gray-400 font-mono">{vendedor.idLegado || '-'}</p>
                            </div>
                            <div className="flex gap-1.5">
                                <button onClick={() => setPermissionsModalVendedor(vendedor)} className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg"><Shield className="h-4 w-4" /></button>
                                <button onClick={() => handleEdit(vendedor)} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg"><Pencil className="h-4 w-4" /></button>
                            </div>
                        </div>

                        {editingId === vendedor.id ? (
                            <div className="space-y-2 pt-2 border-t border-gray-100">
                                <input className="w-full border border-gray-300 rounded px-2 py-1.5 text-[13px] bg-white text-gray-900" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} type="email" placeholder="E-mail" />
                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <label className="text-[10px] text-gray-500 block">Flex Mensal</label>
                                        <input className="w-full border border-gray-300 rounded px-2 py-1.5 text-[13px] bg-white text-gray-900" value={editForm.flexMensal} onChange={e => setEditForm({ ...editForm, flexMensal: e.target.value })} type="number" step="0.01" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-500 block">% Máx Desc.</label>
                                        <input className="w-full border border-gray-300 rounded px-2 py-1.5 text-[13px] bg-white text-gray-900" value={editForm.maxDescontoFlex} onChange={e => setEditForm({ ...editForm, maxDescontoFlex: e.target.value })} type="number" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-500 block">Flex Disp.</label>
                                        <input className="w-full border border-gray-300 rounded px-2 py-1.5 text-[13px] bg-white text-gray-900" value={editForm.flexDisponivel} onChange={e => setEditForm({ ...editForm, flexDisponivel: e.target.value })} type="number" step="0.01" />
                                    </div>
                                </div>
                                <div className="flex gap-2 pt-1">
                                    <button onClick={() => handleSave(vendedor.id)} className="flex-1 bg-green-600 text-white text-[12px] font-semibold py-1.5 rounded-lg flex items-center justify-center gap-1"><Save className="h-3.5 w-3.5" /> Salvar</button>
                                    <button onClick={handleCancel} className="px-3 py-1.5 border border-gray-300 text-gray-600 text-[12px] font-semibold rounded-lg">Cancelar</button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
                                <span className="flex items-center gap-0.5"><Mail className="h-3 w-3" /> {vendedor.email || 'Sem e-mail'}</span>
                                <span>Flex: R$ {Number(vendedor.flexMensal).toFixed(2)}</span>
                                <span>Desc: {Number(vendedor.maxDescontoFlex !== undefined ? vendedor.maxDescontoFlex : 100).toFixed(0)}%</span>
                                <span className="font-semibold text-green-700">Disp: R$ {Number(vendedor.flexDisponivel).toFixed(2)}</span>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {permissionsModalVendedor && (
                <PermissoesModal
                    vendedor={permissionsModalVendedor}
                    onClose={() => setPermissionsModalVendedor(null)}
                    onUpdated={() => {
                        setPermissionsModalVendedor(null);
                        fetchVendedores();
                    }}
                />
            )}
        </div>
    );
};

export default ListaVendedores;
