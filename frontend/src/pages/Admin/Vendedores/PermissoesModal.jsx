import React, { useState, useEffect } from 'react';
import { X, Save, Shield } from 'lucide-react';
import vendedorService from '../../../services/vendedorService';
import configService from '../../../services/configService';
import tabelaPrecoService from '../../../services/tabelaPrecoService';
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
    // Módulo de Expedição e Logística
    Pode_Acessar_Embarque: false,
    Pode_Executar_Entregas: false,
    Pode_Ver_Todas_Entregas: false,
    Pode_Ajustar_Entregas: false,
    // Módulo Caixa Diário e Despesas
    Pode_Acessar_Caixa: false,
    Pode_Editar_Caixa: false,
    Pode_Definir_Adiantamento: false,
    Pode_Ver_Historico_Caixa: false,
    Pode_Reverter_Caixa: false,
    // Módulo de Veículos
    Pode_Acessar_Veiculos: false,
    Pode_Editar_Veiculos: false,
    // CRM / Leads
    Pode_Editar_Lead: false,
    // Pedidos Especiais
    Pode_Criar_Especial: false,
    Pode_Aprovar_Especial: false,
    categoriasEspeciais: [], // Categorias extras visíveis em pedidos especiais
    condicoesEspeciais: [], // Condições de pagamento permitidas para pedidos especiais
    // Financeiro
    Pode_Acessar_Contas_Receber: false,
    Pode_Baixar_Contas_Receber: false,
    // Utilitários Admin
    Pode_Resetar_Dados: false,
    admin: false // Flag Global Mestre
};

const TAB_LABELS = {
    catalogo: "Catálogo",
    pedidos: "Pedidos",
    rota: "Rota e Leads",
    clientes: "Clientes",
    produtos: "Produtos",
    vendedores: "Usuários",
    sync: "Painel Sincronização",
    configuracoes: "Configurações (Bancos/Tabelas)"
};

const PermissoesModal = ({ vendedor, onClose, onUpdated }) => {
    const [login, setLogin] = useState('');
    const [senha, setSenha] = useState('');
    const [permissoes, setPermissoes] = useState(DEFAULT_PERMISSIONS);
    const [saving, setSaving] = useState(false);
    const [todasCategorias, setTodasCategorias] = useState([]);
    const [todasCondicoes, setTodasCondicoes] = useState([]);

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
        // Carregar categorias de produto disponíveis
        configService.getCategorias().then(cats => setTodasCategorias(cats || [])).catch(() => {});
        // Carregar condições de pagamento ativas
        tabelaPrecoService.listar(true).then(conds => setTodasCondicoes(conds || [])).catch(() => {});
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
                            {Object.keys(TAB_LABELS).map(tabKey => (
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

                    {/* Módulo Embarque e Logística */}
                    <div className="border-t pt-4">
                        <h4 className="font-medium text-gray-900 mb-4">Módulo de Expedição e Logística (Embarques)</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-sky-50 p-4 rounded-md border border-sky-200">
                            <label className="flex items-center space-x-3 text-sm cursor-pointer p-2 hover:bg-sky-100 rounded transition-colors">
                                <input
                                    type="checkbox"
                                    className="rounded border-sky-300 text-sky-600 focus:ring-sky-500 h-4 w-4"
                                    checked={!!permissoes.Pode_Acessar_Embarque}
                                    onChange={(e) => setPermissoes(prev => ({ ...prev, Pode_Acessar_Embarque: e.target.checked }))}
                                />
                                <div>
                                    <span className="text-sky-900 font-bold block">Montar Cargas (Expedição)</span>
                                    <span className="text-sky-700 text-xs">Acessa painel de impressão rápida de Romaneiros A4 e atrela pedidos Faturados.</span>
                                </div>
                            </label>

                            <label className="flex items-center space-x-3 text-sm cursor-pointer p-2 hover:bg-sky-100 rounded transition-colors">
                                <input
                                    type="checkbox"
                                    className="rounded border-sky-300 text-sky-600 focus:ring-sky-500 h-4 w-4"
                                    checked={!!permissoes.Pode_Executar_Entregas}
                                    onChange={(e) => setPermissoes(prev => ({ ...prev, Pode_Executar_Entregas: e.target.checked }))}
                                />
                                <div>
                                    <span className="text-sky-900 font-bold block">Motorista (App Mobile)</span>
                                    <span className="text-sky-700 text-xs">Transforma o usuário em um Caminhoneiro habilitado a checar entregas e lançar dinheiro.</span>
                                </div>
                            </label>

                            <label className="flex items-center space-x-3 text-sm cursor-pointer p-2 hover:bg-sky-100 rounded transition-colors">
                                <input
                                    type="checkbox"
                                    className="rounded border-sky-300 text-sky-600 focus:ring-sky-500 h-4 w-4"
                                    checked={!!permissoes.Pode_Ver_Todas_Entregas}
                                    onChange={(e) => setPermissoes(prev => ({ ...prev, Pode_Ver_Todas_Entregas: e.target.checked }))}
                                />
                                <div>
                                    <span className="text-sky-900 font-bold block">Auditor de Entregas</span>
                                    <span className="text-sky-700 text-xs">Membro do escritório que visualiza a esteira de todos os motoristas ativamente na rua.</span>
                                </div>
                            </label>

                            <label className="flex items-center space-x-3 text-sm cursor-pointer p-2 hover:bg-sky-100 rounded transition-colors">
                                <input
                                    type="checkbox"
                                    className="rounded border-red-300 text-red-600 focus:ring-red-500 h-4 w-4"
                                    checked={!!permissoes.Pode_Ajustar_Entregas}
                                    onChange={(e) => setPermissoes(prev => ({ ...prev, Pode_Ajustar_Entregas: e.target.checked }))}
                                />
                                <div>
                                    <span className="text-red-900 font-bold block">Administrador Financeiro de Entrega</span>
                                    <span className="text-red-700 text-xs">Nível crítico: Pode desmanchar/alterar Devoluções ou Pagamentos efetuados pelo motorista após concluir entrega.</span>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Módulo Caixa Diário e Despesas */}
                    <div className="border-t pt-4">
                        <h4 className="font-medium text-gray-900 mb-4">Módulo Caixa Diário e Despesas</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-amber-50 p-4 rounded-md border border-amber-200">
                            <label className="flex items-center space-x-3 text-sm cursor-pointer p-2 hover:bg-amber-100 rounded transition-colors">
                                <input
                                    type="checkbox"
                                    className="rounded border-amber-300 text-amber-600 focus:ring-amber-500 h-4 w-4"
                                    checked={!!permissoes.Pode_Acessar_Caixa}
                                    onChange={(e) => setPermissoes(prev => ({ ...prev, Pode_Acessar_Caixa: e.target.checked }))}
                                />
                                <div>
                                    <span className="text-amber-900 font-bold block">Acessar Caixa/Despesas</span>
                                    <span className="text-amber-700 text-xs">Visualiza e lança despesas, abre caixa diário, define adiantamento e fecha caixa.</span>
                                </div>
                            </label>

                            <label className="flex items-center space-x-3 text-sm cursor-pointer p-2 hover:bg-red-50 rounded transition-colors">
                                <input
                                    type="checkbox"
                                    className="rounded border-red-300 text-red-600 focus:ring-red-500 h-4 w-4"
                                    checked={!!permissoes.Pode_Editar_Caixa}
                                    onChange={(e) => setPermissoes(prev => ({ ...prev, Pode_Editar_Caixa: e.target.checked }))}
                                />
                                <div>
                                    <span className="text-red-900 font-bold block">Auditor Financeiro do Caixa</span>
                                    <span className="text-red-700 text-xs">Nível crítico: Confere caixas de outros usuários, edita despesas alheias e marca entregas como conferidas.</span>
                                </div>
                            </label>

                            <label className="flex items-center space-x-3 text-sm cursor-pointer p-2 hover:bg-amber-100 rounded transition-colors col-span-full">
                                <input
                                    type="checkbox"
                                    className="rounded border-amber-300 text-amber-600 focus:ring-amber-500 h-4 w-4"
                                    checked={!!permissoes.Pode_Definir_Adiantamento}
                                    onChange={(e) => setPermissoes(prev => ({ ...prev, Pode_Definir_Adiantamento: e.target.checked }))}
                                />
                                <div>
                                    <span className="text-amber-900 font-bold block">Pode Definir Adiantamento</span>
                                    <span className="text-amber-700 text-xs">Permite editar o valor de adiantamento do caixa diário. Sem esta permissão, o adiantamento fica em modo leitura.</span>
                                </div>
                            </label>

                            <label className="flex items-center space-x-3 text-sm cursor-pointer p-2 hover:bg-amber-100 rounded transition-colors col-span-full">
                                <input
                                    type="checkbox"
                                    className="rounded border-amber-300 text-amber-600 focus:ring-amber-500 h-4 w-4"
                                    checked={!!permissoes.Pode_Ver_Historico_Caixa}
                                    onChange={(e) => setPermissoes(prev => ({ ...prev, Pode_Ver_Historico_Caixa: e.target.checked }))}
                                />
                                <div>
                                    <span className="text-amber-900 font-bold block">Pode Ver Caixas de Outros Dias</span>
                                    <span className="text-amber-700 text-xs">Permite navegar por datas passadas ou futuras no caixa diário. Sem esta permissão, o usuário vê apenas o caixa de hoje.</span>
                                </div>
                            </label>

                            <label className="flex items-center space-x-3 text-sm cursor-pointer p-2 hover:bg-red-50 rounded transition-colors col-span-full">
                                <input
                                    type="checkbox"
                                    className="rounded border-red-300 text-red-600 focus:ring-red-500 h-4 w-4"
                                    checked={!!permissoes.Pode_Reverter_Caixa}
                                    onChange={(e) => setPermissoes(prev => ({ ...prev, Pode_Reverter_Caixa: e.target.checked }))}
                                />
                                <div>
                                    <span className="text-red-900 font-bold block">Pode Reverter Caixa</span>
                                    <span className="text-red-700 text-xs">Nível crítico: Permite reverter a conferência e reabrir caixas já fechados. Todas as ações são registradas no log de auditoria.</span>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Módulo Veículos */}
                    <div className="border-t pt-4">
                        <h4 className="font-medium text-gray-900 mb-4">Módulo de Veículos</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-md border border-slate-200">
                            <label className="flex items-center space-x-3 text-sm cursor-pointer p-2 hover:bg-slate-100 rounded transition-colors">
                                <input
                                    type="checkbox"
                                    className="rounded border-slate-300 text-slate-600 focus:ring-slate-500 h-4 w-4"
                                    checked={!!permissoes.Pode_Acessar_Veiculos}
                                    onChange={(e) => setPermissoes(prev => ({ ...prev, Pode_Acessar_Veiculos: e.target.checked }))}
                                />
                                <div>
                                    <span className="text-slate-900 font-bold block">Pode Acessar Veículos</span>
                                    <span className="text-slate-700 text-xs">Exibe a aba Veículos e permite consultar ficha em modo leitura.</span>
                                </div>
                            </label>

                            <label className="flex items-center space-x-3 text-sm cursor-pointer p-2 hover:bg-red-50 rounded transition-colors">
                                <input
                                    type="checkbox"
                                    className="rounded border-red-300 text-red-600 focus:ring-red-500 h-4 w-4"
                                    checked={!!permissoes.Pode_Editar_Veiculos}
                                    onChange={(e) => setPermissoes(prev => ({ ...prev, Pode_Editar_Veiculos: e.target.checked }))}
                                />
                                <div>
                                    <span className="text-red-900 font-bold block">Pode Editar Veículos</span>
                                    <span className="text-red-700 text-xs">Permite cadastrar/editar/excluir veículo e lançar manutenção/uso/abastecimento.</span>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* CRM / Leads */}
                    <div className="border-t pt-4">
                        <h4 className="font-medium text-gray-900 mb-4">CRM / Leads</h4>
                        <div className="bg-teal-50 p-4 rounded-md border border-teal-200">
                            <label className="flex items-center space-x-3 text-sm cursor-pointer p-2 hover:bg-teal-100 rounded transition-colors">
                                <input
                                    type="checkbox"
                                    className="rounded border-teal-300 text-teal-600 focus:ring-teal-500 h-4 w-4"
                                    checked={!!permissoes.Pode_Editar_Lead}
                                    onChange={(e) => setPermissoes(prev => ({ ...prev, Pode_Editar_Lead: e.target.checked }))}
                                />
                                <div>
                                    <span className="text-teal-900 font-bold block">Pode Editar Lead</span>
                                    <span className="text-teal-700 text-xs">Permite editar leads após o cadastro inicial. Sem esta permissão, o usuário só cria novos leads mas não pode alterar os existentes.</span>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Pedidos Especiais */}
                    <div className="border-t pt-4">
                        <h4 className="font-medium text-gray-900 mb-4">Pedidos Especiais (Sem Nota)</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-purple-50 p-4 rounded-md border border-purple-200">
                            <label className="flex items-center space-x-3 text-sm cursor-pointer p-2 hover:bg-purple-100 rounded transition-colors">
                                <input
                                    type="checkbox"
                                    className="rounded border-purple-300 text-purple-600 focus:ring-purple-500 h-4 w-4"
                                    checked={!!permissoes.Pode_Criar_Especial}
                                    onChange={(e) => setPermissoes(prev => ({ ...prev, Pode_Criar_Especial: e.target.checked }))}
                                />
                                <div>
                                    <span className="text-purple-900 font-bold block">Pode Criar Pedido Especial</span>
                                    <span className="text-purple-700 text-xs">Habilita o toggle "Especial" na tela de novo pedido. Pedidos especiais não geram nota fiscal.</span>
                                </div>
                            </label>

                            <label className="flex items-center space-x-3 text-sm cursor-pointer p-2 hover:bg-purple-100 rounded transition-colors">
                                <input
                                    type="checkbox"
                                    className="rounded border-purple-300 text-purple-600 focus:ring-purple-500 h-4 w-4"
                                    checked={!!permissoes.Pode_Aprovar_Especial}
                                    onChange={(e) => setPermissoes(prev => ({ ...prev, Pode_Aprovar_Especial: e.target.checked }))}
                                />
                                <div>
                                    <span className="text-purple-900 font-bold block">Pode Aprovar Pedido Especial</span>
                                    <span className="text-purple-700 text-xs">Permite aprovar/faturar pedidos especiais pendentes na aba Especiais da lista de pedidos.</span>
                                </div>
                            </label>
                        </div>

                        {/* Categorias Extras para Especiais */}
                        {!!permissoes.Pode_Criar_Especial && todasCategorias.length > 0 && (
                            <div className="mt-4 bg-purple-50 p-4 rounded-md border border-purple-200">
                                <h5 className="text-sm font-bold text-purple-900 mb-2">Categorias Extras (Pedido Especial)</h5>
                                <p className="text-xs text-purple-700 mb-3">
                                    Selecione categorias adicionais que este vendedor poderá ver ao criar pedidos especiais, além das configuradas globalmente.
                                </p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                                    {todasCategorias.map(cat => (
                                        <label key={cat} className="flex items-center space-x-2 text-xs cursor-pointer p-1.5 hover:bg-purple-100 rounded transition-colors">
                                            <input
                                                type="checkbox"
                                                className="rounded border-purple-300 text-purple-600 focus:ring-purple-500 h-3.5 w-3.5"
                                                checked={(permissoes.categoriasEspeciais || []).includes(cat)}
                                                onChange={(e) => {
                                                    const current = permissoes.categoriasEspeciais || [];
                                                    const updated = e.target.checked
                                                        ? [...current, cat]
                                                        : current.filter(c => c !== cat);
                                                    setPermissoes(prev => ({ ...prev, categoriasEspeciais: updated }));
                                                }}
                                            />
                                            <span className="text-purple-800">{cat}</span>
                                        </label>
                                    ))}
                                </div>
                                <p className="text-[10px] text-purple-500 mt-2">
                                    {(permissoes.categoriasEspeciais || []).length} categoria(s) extra(s) selecionada(s)
                                </p>
                            </div>
                        )}

                        {/* Condições de Pagamento para Especiais */}
                        {!!permissoes.Pode_Criar_Especial && todasCondicoes.length > 0 && (
                            <div className="mt-4 bg-purple-50 p-4 rounded-md border border-purple-200">
                                <h5 className="text-sm font-bold text-purple-900 mb-2">Condições de Pagamento (Pedido Especial)</h5>
                                <p className="text-xs text-purple-700 mb-3">
                                    Selecione quais condições de pagamento este vendedor pode usar em pedidos especiais. Se nenhuma for selecionada, todas estarão disponíveis.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                                    {todasCondicoes.map(cond => (
                                        <label key={cond.idCondicao || cond.id} className="flex items-center space-x-2 text-xs cursor-pointer p-1.5 hover:bg-purple-100 rounded transition-colors">
                                            <input
                                                type="checkbox"
                                                className="rounded border-purple-300 text-purple-600 focus:ring-purple-500 h-3.5 w-3.5"
                                                checked={(permissoes.condicoesEspeciais || []).includes(cond.idCondicao || cond.id)}
                                                onChange={(e) => {
                                                    const condId = cond.idCondicao || cond.id;
                                                    const current = permissoes.condicoesEspeciais || [];
                                                    const updated = e.target.checked
                                                        ? [...current, condId]
                                                        : current.filter(c => c !== condId);
                                                    setPermissoes(prev => ({ ...prev, condicoesEspeciais: updated }));
                                                }}
                                            />
                                            <span className="text-purple-800">{cond.nome || cond.descricao || cond.idCondicao}</span>
                                        </label>
                                    ))}
                                </div>
                                <p className="text-[10px] text-purple-500 mt-2">
                                    {(permissoes.condicoesEspeciais || []).length} condição(ões) selecionada(s)
                                    {(permissoes.condicoesEspeciais || []).length === 0 && ' — todas disponíveis'}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Financeiro */}
                    <div className="border-t pt-4">
                        <h4 className="font-medium text-gray-900 mb-4">Financeiro</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-emerald-50 p-4 rounded-md border border-emerald-200">
                            <label className="flex items-center space-x-3 text-sm cursor-pointer p-2 hover:bg-emerald-100 rounded transition-colors">
                                <input
                                    type="checkbox"
                                    className="rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                                    checked={!!permissoes.Pode_Acessar_Contas_Receber}
                                    onChange={(e) => setPermissoes(prev => ({ ...prev, Pode_Acessar_Contas_Receber: e.target.checked }))}
                                />
                                <div>
                                    <span className="text-emerald-900 font-bold block">Pode Acessar Contas a Receber</span>
                                    <span className="text-emerald-700 text-xs">Visualiza a tela de contas a receber com parcelas e status dos pagamentos.</span>
                                </div>
                            </label>

                            <label className="flex items-center space-x-3 text-sm cursor-pointer p-2 hover:bg-emerald-100 rounded transition-colors">
                                <input
                                    type="checkbox"
                                    className="rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                                    checked={!!permissoes.Pode_Baixar_Contas_Receber}
                                    onChange={(e) => setPermissoes(prev => ({ ...prev, Pode_Baixar_Contas_Receber: e.target.checked }))}
                                />
                                <div>
                                    <span className="text-emerald-900 font-bold block">Pode Dar Baixa em Parcelas</span>
                                    <span className="text-emerald-700 text-xs">Permite registrar pagamentos e estornar baixas nas contas a receber.</span>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Utilitários Admin */}
                    <div className="border-t pt-4">
                        <h4 className="font-medium text-gray-900 mb-4">Utilitários de Administração</h4>
                        <div className="bg-red-50 p-4 rounded-md border border-red-200">
                            <label className="flex items-center space-x-3 text-sm cursor-pointer p-2 hover:bg-red-100 rounded transition-colors">
                                <input
                                    type="checkbox"
                                    className="rounded border-red-300 text-red-600 focus:ring-red-500 h-4 w-4"
                                    checked={!!permissoes.Pode_Resetar_Dados}
                                    onChange={(e) => setPermissoes(prev => ({ ...prev, Pode_Resetar_Dados: e.target.checked }))}
                                />
                                <div>
                                    <span className="text-red-900 font-bold block">Pode Resetar Dados</span>
                                    <span className="text-red-700 text-xs">Permite acessar a ferramenta de limpeza de dados na tela de Configurações Gerais. Ação destrutiva e irreversível.</span>
                                </div>
                            </label>
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
