import React, { useState, useEffect } from 'react';
import { Pencil, Save, X, Search, DollarSign, Mail, Shield, UserX, UserCheck, User, MessageCircle, Phone } from 'lucide-react';
import vendedorService from '../../../services/vendedorService';
import PermissoesModal from './PermissoesModal';
import toast from 'react-hot-toast';

const FORMAS_OPTIONS = [
    { value: 'PRESENCIAL', label: 'Presencial', icon: User, color: 'purple' },
    { value: 'WHATSAPP', label: 'WhatsApp', icon: MessageCircle, color: 'green' },
    { value: 'TELEFONE', label: 'Telefone', icon: Phone, color: 'blue' },
];

const ListaVendedores = () => {
    const [vendedores, setVendedores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [mostrarInativos, setMostrarInativos] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [permissionsModalVendedor, setPermissionsModalVendedor] = useState(null);

    // Toggle direto de formas de atendimento visíveis (auto-save)
    const handleToggleForma = async (vendedor, formaValue) => {
        const atual = vendedor.formasAtendimentoVisiveis || [];
        const jaAtivo = atual.includes(formaValue);
        const novas = jaAtivo ? atual.filter(v => v !== formaValue) : [...atual, formaValue];
        try {
            const updated = await vendedorService.atualizar(vendedor.id, { formasAtendimentoVisiveis: novas });
            setVendedores(vendedores.map(v => v.id === vendedor.id ? updated : v));
            toast.success(`${vendedor.nome}: formas atualizadas`);
        } catch (error) {
            toast.error('Erro ao salvar formas de atendimento');
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

    const handleToggleAtivo = async (vendedor) => {
        const novoStatus = !vendedor.ativo;
        const acao = novoStatus ? 'reativar' : 'inativar';
        if (!window.confirm(`Deseja ${acao} o usuário ${vendedor.nome}?${!novoStatus ? '\n\nEle não poderá mais acessar a plataforma e não será possível emitir pedidos para clientes vinculados a ele.' : ''}`)) return;
        try {
            const updated = await vendedorService.atualizar(vendedor.id, { ativo: novoStatus });
            setVendedores(vendedores.map(v => v.id === vendedor.id ? updated : v));
            toast.success(`${vendedor.nome} ${novoStatus ? 'reativado' : 'inativado'} com sucesso`);
        } catch (error) {
            toast.error('Erro ao alterar status do vendedor');
        }
    };

    const filtered = vendedores.filter(v => {
        const matchSearch = v.nome.toLowerCase().includes(searchTerm.toLowerCase());
        if (mostrarInativos) return matchSearch;
        return matchSearch && v.ativo !== false;
    });

    return (
        <div className="max-w-7xl mx-auto px-3 md:px-6 lg:px-8 py-4 md:py-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 md:mb-6 gap-2">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900">Usuários</h1>
                    <p className="mt-0.5 text-xs md:text-sm text-gray-500">Gerencie limites de Flex e logísticas da equipe</p>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer whitespace-nowrap">
                        <input
                            type="checkbox"
                            checked={mostrarInativos}
                            onChange={e => setMostrarInativos(e.target.checked)}
                            className="rounded border-gray-300 text-gray-600 focus:ring-gray-500 h-3.5 w-3.5"
                        />
                        Mostrar inativos
                    </label>
                    <div className="relative flex-1 sm:flex-none">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar vendedor..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full sm:w-48 pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-blue-400 outline-none"
                        />
                    </div>
                </div>
            </div>

            {/* Desktop: Tabela */}
            <div className="hidden md:block bg-white shadow rounded-lg overflow-hidden">
                <table className="w-full table-fixed divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="w-[14%] px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                            <th className="w-[22%] px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">E-mail</th>
                            <th className="w-[10%] px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Flex Mensal</th>
                            <th className="w-[8%] px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">% Desc.</th>
                            <th className="w-[10%] px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Flex Disp.</th>
                            <th className="w-[24%] px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Formas Visíveis</th>
                            <th className="w-[12%] px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr><td colSpan="7" className="px-3 py-4 text-center">Carregando...</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan="7" className="px-3 py-4 text-center text-gray-500">Nenhum usuário encontrado.</td></tr>
                        ) : filtered.map(vendedor => (
                            editingId === vendedor.id ? (
                                <tr key={vendedor.id} className="bg-blue-50">
                                    <td className="px-3 py-3 text-sm font-medium text-gray-900">
                                        <div className="font-bold truncate">{vendedor.nome}</div>
                                        <div className="flex gap-2 mt-2">
                                            <button onClick={() => handleSave(vendedor.id)} className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700"><Save className="h-3.5 w-3.5" /> Salvar</button>
                                            <button onClick={handleCancel} className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-100"><X className="h-3.5 w-3.5" /> Cancelar</button>
                                        </div>
                                    </td>
                                    <td className="px-3 py-3 text-sm text-gray-500">
                                        <input className="border border-gray-300 rounded px-2 py-1 w-full bg-white text-gray-900 text-xs" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} type="email" />
                                    </td>
                                    <td className="px-3 py-3 text-sm text-gray-500">
                                        <input className="border border-gray-300 rounded px-2 py-1 w-full bg-white text-gray-900 text-xs" value={editForm.flexMensal} onChange={e => setEditForm({ ...editForm, flexMensal: e.target.value })} type="number" step="0.01" />
                                    </td>
                                    <td className="px-3 py-3 text-sm text-gray-500">
                                        <div className="flex items-center">
                                            <input className="border border-gray-300 rounded px-2 py-1 w-full bg-white text-gray-900 text-xs" value={editForm.maxDescontoFlex} onChange={e => setEditForm({ ...editForm, maxDescontoFlex: e.target.value })} type="number" step="0.01" min="0" max="100" />
                                            <span className="ml-1 text-xs">%</span>
                                        </div>
                                    </td>
                                    <td className="px-3 py-3 text-sm text-gray-500">
                                        <input className="border border-gray-300 rounded px-2 py-1 w-full bg-white text-gray-900 text-xs" value={editForm.flexDisponivel} onChange={e => setEditForm({ ...editForm, flexDisponivel: e.target.value })} type="number" step="0.01" />
                                    </td>
                                    <td className="px-3 py-3 text-sm text-gray-500">
                                        <div className="flex flex-wrap gap-1">
                                            {FORMAS_OPTIONS.map(f => {
                                                const Icon = f.icon;
                                                const ativo = (vendedor.formasAtendimentoVisiveis || []).includes(f.value);
                                                return (
                                                    <button key={f.value} type="button" onClick={() => handleToggleForma(vendedor, f.value)} className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded border transition-colors cursor-pointer ${ativo ? `bg-${f.color}-100 text-${f.color}-700 border-${f.color}-300` : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                                                        <Icon className="h-3 w-3" />{f.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </td>
                                    <td></td>
                                </tr>
                            ) : (
                            <tr key={vendedor.id} className={vendedor.ativo === false ? 'bg-gray-50 opacity-60' : ''}>
                                <td className="px-3 py-3 text-sm font-medium text-gray-900">
                                    <div className="flex items-center gap-1">
                                        <span className="truncate">{vendedor.nome}</span>
                                        {vendedor.ativo === false && <span className="text-[9px] bg-red-100 text-red-700 px-1 py-0.5 rounded font-semibold shrink-0">INATIVO</span>}
                                    </div>
                                    <div className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">{vendedor.idLegado || '-'}</div>
                                </td>
                                <td className="px-3 py-3 text-sm text-gray-500">
                                    <div className="flex items-center truncate">
                                        <Mail className="h-3.5 w-3.5 mr-1.5 text-gray-400 shrink-0" />
                                        <span className="truncate text-xs">{vendedor.email || <span className="text-gray-300 italic">Sem e-mail</span>}</span>
                                    </div>
                                </td>
                                <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                                    {`R$ ${Number(vendedor.flexMensal).toFixed(2)}`}
                                </td>
                                <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                                    {`${Number(vendedor.maxDescontoFlex !== undefined ? vendedor.maxDescontoFlex : 100).toFixed(0)}%`}
                                </td>
                                <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                                    {`R$ ${Number(vendedor.flexDisponivel).toFixed(2)}`}
                                </td>
                                <td className="px-3 py-3 text-sm text-gray-500">
                                    <div className="flex flex-wrap gap-1">
                                        {FORMAS_OPTIONS.map(f => {
                                            const Icon = f.icon;
                                            const ativo = (vendedor.formasAtendimentoVisiveis || []).includes(f.value);
                                            return (
                                                <button key={f.value} type="button" onClick={() => handleToggleForma(vendedor, f.value)} className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded border transition-colors cursor-pointer ${ativo ? `bg-${f.color}-100 text-${f.color}-700 border-${f.color}-300` : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                                                    <Icon className="h-3 w-3" />{f.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap text-right text-sm font-medium">
                                    <div className="flex justify-end space-x-1.5">
                                        <button onClick={() => setPermissionsModalVendedor(vendedor)} className="text-indigo-600 hover:text-indigo-900" title="Acessos e Permissões"><Shield className="h-4 w-4" /></button>
                                        <button onClick={() => handleEdit(vendedor)} className="text-primary hover:text-indigo-900" title="Editar"><Pencil className="h-4 w-4" /></button>
                                        <button onClick={() => handleToggleAtivo(vendedor)} className={vendedor.ativo === false ? 'text-green-600 hover:text-green-800' : 'text-red-500 hover:text-red-700'} title={vendedor.ativo === false ? 'Reativar' : 'Inativar'}>
                                            {vendedor.ativo === false ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                            )
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
                    <div key={vendedor.id} className={`bg-white rounded-xl border shadow-sm p-3 ${vendedor.ativo === false ? 'border-red-200 opacity-60' : 'border-gray-200'}`}>
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <p className="font-bold text-[14px] text-gray-900">{vendedor.nome}</p>
                                    {vendedor.ativo === false && <span className="text-[9px] bg-red-100 text-red-700 px-1 py-0.5 rounded font-semibold">INATIVO</span>}
                                </div>
                                <p className="text-[11px] text-gray-400 font-mono">{vendedor.idLegado || '-'}</p>
                            </div>
                            <div className="flex gap-1.5">
                                <button onClick={() => setPermissionsModalVendedor(vendedor)} className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg"><Shield className="h-4 w-4" /></button>
                                <button onClick={() => handleEdit(vendedor)} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg"><Pencil className="h-4 w-4" /></button>
                                <button onClick={() => handleToggleAtivo(vendedor)} className={`p-1.5 rounded-lg ${vendedor.ativo === false ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                                    {vendedor.ativo === false ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                                </button>
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
                            <>
                                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
                                    <span className="flex items-center gap-0.5"><Mail className="h-3 w-3" /> {vendedor.email || 'Sem e-mail'}</span>
                                    <span>Flex: R$ {Number(vendedor.flexMensal).toFixed(2)}</span>
                                    <span>Desc: {Number(vendedor.maxDescontoFlex !== undefined ? vendedor.maxDescontoFlex : 100).toFixed(0)}%</span>
                                    <span className="font-semibold text-green-700">Disp: R$ {Number(vendedor.flexDisponivel).toFixed(2)}</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-gray-100">
                                    <span className="text-[10px] text-gray-400 w-full mb-0.5">Formas visíveis:</span>
                                    {FORMAS_OPTIONS.map(f => {
                                        const Icon = f.icon;
                                        const ativo = (vendedor.formasAtendimentoVisiveis || []).includes(f.value);
                                        return (
                                            <button
                                                key={f.value}
                                                type="button"
                                                onClick={() => handleToggleForma(vendedor, f.value)}
                                                className={`flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold rounded border transition-colors ${ativo ? `bg-${f.color}-100 text-${f.color}-700 border-${f.color}-300` : 'bg-gray-50 text-gray-400 border-gray-200'}`}
                                            >
                                                <Icon className="h-3 w-3" />{f.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
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
