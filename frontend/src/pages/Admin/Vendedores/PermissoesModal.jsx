import React, { useState, useEffect } from 'react';
import { X, Save, Shield } from 'lucide-react';
import vendedorService from '../../../services/vendedorService';
import toast from 'react-hot-toast';

const DEFAULT_PERMISSIONS = {
    catalogo: { view: false, edit: false },
    pedidos: { view: false, edit: false, clientes: "vinculados" },
    rota: { view: false, edit: false },
    clientes: { view: false, edit: false },
    produtos: { view: false, edit: false },
    vendedores: { view: false, edit: false },
    sync: { view: false, edit: false },
    configuracoes: { view: false, edit: false },
    admin: false // Flag Global Mestre
};

const TAB_LABELS = {
    catalogo: "Catálogo",
    pedidos: "Pedidos",
    rota: "Rota / Leads",
    clientes: "Clientes",
    produtos: "Produtos",
    vendedores: "Vendedores",
    sync: "Painel Sincronização",
    configuracoes: "Configurações (Bancos/Tabelas)"
};

const PermissoesModal = ({ vendedor, onClose, onUpdated }) => {
    const [login, setLogin] = useState('');
    const [senha, setSenha] = useState('');
    const [permissoes, setPermissoes] = useState(DEFAULT_PERMISSIONS);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (vendedor) {
            setLogin(vendedor.login || '');

            let parsedPermissoes = DEFAULT_PERMISSIONS;
            if (vendedor.permissoes) {
                try {
                    const parsed = typeof vendedor.permissoes === 'string'
                        ? JSON.parse(vendedor.permissoes)
                        : vendedor.permissoes;
                    parsedPermissoes = { ...DEFAULT_PERMISSIONS, ...parsed };
                } catch (e) {
                    console.error("Erro parse json permissões");
                }
            }
            setPermissoes(parsedPermissoes);
        }
    }, [vendedor]);

    const toggleView = (tab) => {
        setPermissoes(prev => ({
            ...prev,
            [tab]: { ...prev[tab], view: !prev[tab]?.view }
        }));
    };

    const toggleEdit = (tab) => {
        setPermissoes(prev => ({
            ...prev,
            [tab]: { ...prev[tab], edit: !prev[tab]?.edit }
        }));
    };

    const changeClientesScope = (val) => {
        setPermissoes(prev => ({
            ...prev,
            pedidos: { ...prev.pedidos, clientes: val }
        }));
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            const data = { login, permissoes };
            if (senha && senha.trim() !== '') {
                data.senha = senha;
            }

            await vendedorService.atualizar(vendedor.id, data);
            toast.success('Permissões e acessos salvos!');
            onUpdated();
        } catch (error) {
            toast.error('Erro ao salvar acessos.');
            console.error(error);
        } finally {
            setSaving(false);
        }
    };

    if (!vendedor) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-black bg-opacity-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col m-4">

                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center">
                        <Shield className="h-5 w-5 text-indigo-600 mr-2" />
                        <h3 className="text-lg font-medium text-gray-900">
                            Acessos de: {vendedor.nome}
                        </h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
                        <X className="h-6 w-6" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-4 overflow-y-auto flex-1 space-y-6">

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Nome de Usuário (Login)</label>
                            <input
                                type="text"
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                                value={login}
                                onChange={e => setLogin(e.target.value)}
                                placeholder="Ex: Clark"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Nova Senha</label>
                            <input
                                type="text"
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                                value={senha}
                                onChange={e => setSenha(e.target.value)}
                                placeholder="Deixe vazio para não alterar"
                            />
                        </div>
                    </div>

                    <div className="border-t pt-4">
                        <div className="flex items-center justify-between bg-indigo-50 p-4 rounded-md border border-indigo-200 mb-6">
                            <div>
                                <h4 className="font-bold text-indigo-900">Administrador Global (Isento de Ponto)</h4>
                                <p className="text-xs text-indigo-700 mt-1">Este usuário pula a trava Matinal de Veículos/KM e tem acesso irrestrito visual aos Menus Administrativos Superiores.</p>
                            </div>
                            <label className="flex items-center space-x-2 text-sm cursor-pointer ml-4">
                                <input
                                    type="checkbox"
                                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-5 w-5"
                                    checked={!!permissoes.admin}
                                    onChange={(e) => setPermissoes(prev => ({ ...prev, admin: e.target.checked }))}
                                />
                            </label>
                        </div>

                        <h4 className="font-medium text-gray-900 mb-4">Permissões de Abas</h4>
                        <div className="space-y-3">
                            {Object.keys(DEFAULT_PERMISSIONS).filter(k => k !== 'admin').map(tabKey => (
                                <div key={tabKey} className="flex flex-col sm:flex-row sm:items-center justify-between bg-gray-50 p-3 rounded-md border border-gray-200">
                                    <span className="font-medium text-sm text-gray-700 mb-2 sm:mb-0 w-1/3">
                                        {TAB_LABELS[tabKey] || tabKey}
                                    </span>

                                    <div className="flex space-x-6">
                                        <label className="flex items-center space-x-2 text-sm cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                checked={!!permissoes[tabKey]?.view}
                                                onChange={() => toggleView(tabKey)}
                                            />
                                            <span>Visualizar</span>
                                        </label>

                                        <label className="flex items-center space-x-2 text-sm cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                checked={!!permissoes[tabKey]?.edit}
                                                onChange={() => toggleEdit(tabKey)}
                                            />
                                            <span>Gerenciar/Criar</span>
                                        </label>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="border-t pt-4">
                        <h4 className="font-medium text-gray-900 mb-2">Regra de Pedidos & Clientes</h4>
                        <p className="text-sm text-gray-500 mb-4">Se este usuário pode acessar pedidos, ele pode fazer pedidos para quais clientes?</p>
                        <div className="flex space-x-4">
                            <label className="flex items-center space-x-2 text-sm cursor-pointer">
                                <input type="radio" name="clientes" value="todos"
                                    checked={permissoes.pedidos?.clientes === 'todos'}
                                    onChange={(e) => changeClientesScope(e.target.value)}
                                />
                                <span>Todos os Clientes</span>
                            </label>
                            <label className="flex items-center space-x-2 text-sm cursor-pointer">
                                <input type="radio" name="clientes" value="vinculados"
                                    checked={permissoes.pedidos?.clientes !== 'todos'}
                                    onChange={(e) => changeClientesScope(e.target.value)}
                                />
                                <span>Apenas seus Clientes Vinculados</span>
                            </label>
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3 bg-gray-50 rounded-b-lg">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                    >
                        <Save className="h-4 w-4 mr-2" />
                        Salvar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PermissoesModal;
