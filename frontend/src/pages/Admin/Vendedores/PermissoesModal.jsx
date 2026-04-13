import React, { useState, useEffect } from 'react';
import {
    X, Save, Shield, ChevronDown, Monitor,
    LayoutDashboard, BookOpen, ClipboardList, Map, Target, Users,
    PackageCheck, Truck, Wallet, Receipt, Search,
    Box, UserCog, Car, RefreshCw, FileText,
    Settings, DollarSign, Warehouse, TrendingUp,
    Factory, Package, BookOpen as BookOpenIcon, Play, Calendar, Lightbulb, BarChart3
} from 'lucide-react';
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
    // Dashboard
    Pode_Ver_Dashboard_Vendas: false,
    Pode_Ver_Dashboard_Admin: false,
    // Módulo de Expedição e Logística
    Pode_Acessar_Embarque: false,
    Pode_Editar_Embarque: false,
    Pode_Executar_Entregas: false,
    Pode_Ver_Todas_Entregas: false,
    Pode_Ajustar_Entregas: false,
    Pode_Editar_GPS: false,
    // Módulo Caixa Diário e Despesas
    Pode_Acessar_Caixa: false,
    Pode_Editar_Caixa: false,
    Pode_Baixar_Caixa: false,
    Pode_Fechar_Caixa: false,
    Pode_Definir_Adiantamento: false,
    Pode_Ver_Historico_Caixa: false,
    Pode_Reverter_Caixa: false,
    // Módulo de Veículos
    Pode_Acessar_Veiculos: false,
    Pode_Editar_Veiculos: false,
    // CRM / Leads
    Pode_Editar_Lead: false,
    // Reatribuição de vendedor em pedidos
    Pode_Reatribuir_Vendedor: false,
    // Exclusão de Registros
    Pode_Excluir_Pedido: false,
    Pode_Excluir_Especial: false,
    Pode_Excluir_Bonificacao: false,
    Pode_Excluir_Amostra: false,
    // Pedidos Especiais
    Pode_Criar_Especial: false,
    Pode_Aprovar_Especial: false,
    Pode_Reverter_Especial: false,
    categoriasEspeciais: [],
    condicoesEspeciais: [],
    // Pedidos Bonificação
    Pode_Criar_Bonificacao: false,
    Pode_Aprovar_Bonificacao: false,
    Pode_Reverter_Bonificacao: false,
    // Metas de Vendas
    Pode_Gerenciar_Metas: false,
    // Financeiro
    Pode_Acessar_Contas_Receber: false,
    Pode_Baixar_Contas_Receber: false,
    // Devoluções
    Pode_Fazer_Devolucao: false,
    Pode_Reverter_Devolucao: false,
    // Utilitários Admin
    Pode_Resetar_Dados: false,
    Isento_Ponto: false,
    admin: false,
    // Permissões de Estoque
    estoque: [],
    // Permissões PCP
    pcp: {
        itens: false,
        receitas: false,
        ordens: false,
        cancelarOrdens: false,
        agenda: false,
        estoque: false,
        sugestoes: false,
    },
    // Tela inicial preferida
    telaInicial: '/',
};

const TELAS_INICIAIS = [
    { value: '/', label: 'Dashboard', icon: LayoutDashboard },
    { value: '/pedidos', label: 'Pedidos', icon: ClipboardList },
    { value: '/catalogo', label: 'Catálogo', icon: BookOpen },
    { value: '/clientes', label: 'Clientes', icon: Users },
    { value: '/admin/embarques', label: 'Embarque', icon: PackageCheck },
    { value: '/entregas', label: 'Entregas', icon: Truck },
    { value: '/minhas-entregas', label: 'Minhas Entregas (Motorista)', icon: Truck },
    { value: '/caixa', label: 'Caixa Diário', icon: Wallet },
    { value: '/despesas', label: 'Despesas', icon: Receipt },
    { value: '/financeiro/contas-receber', label: 'Contas a Receber', icon: DollarSign },
    { value: '/estoque', label: 'Ajuste de Estoque', icon: Warehouse },
    { value: '/estoque/posicao', label: 'Posição de Estoque', icon: Warehouse },
    { value: '/pcp/dashboard', label: 'Dashboard PCP', icon: BarChart3 },
    { value: '/pcp/painel', label: 'Painel Operacional', icon: Play },
    { value: '/admin/produtos', label: 'Produtos (Admin)', icon: Box },
    { value: '/admin/vendedores', label: 'Vendedores (Admin)', icon: UserCog },
    { value: '/admin/config', label: 'Configurações Gerais', icon: Settings },
];

// ── Toggle switch component ──
const Toggle = ({ checked, onChange, label, sublabel, colorClass = 'bg-indigo-600', icon: Icon, danger }) => (
    <label className={`flex items-start gap-3 text-sm cursor-pointer p-2.5 rounded-lg transition-colors ${danger ? 'hover:bg-red-50' : 'hover:bg-gray-50'}`}>
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${checked ? (danger ? 'bg-red-600' : colorClass) : 'bg-gray-200'}`}
        >
            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
        <div className="flex-1 min-w-0">
            {Icon && <Icon className={`inline h-3.5 w-3.5 mr-1.5 ${danger ? 'text-red-500' : 'text-gray-400'}`} />}
            <span className={`font-medium ${danger ? 'text-red-900' : 'text-gray-800'}`}>{label}</span>
            {sublabel && <p className={`text-xs mt-0.5 ${danger ? 'text-red-600' : 'text-gray-500'}`}>{sublabel}</p>}
        </div>
    </label>
);

// ── Collapsible department section ──
const DeptSection = ({ label, icon: Icon, color, defaultOpen = false, children, badge }) => {
    const [open, setOpen] = useState(defaultOpen);
    const colorMap = {
        blue: 'bg-blue-50 border-blue-200 text-blue-800',
        sky: 'bg-sky-50 border-sky-200 text-sky-800',
        emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
        indigo: 'bg-indigo-50 border-indigo-200 text-indigo-800',
        teal: 'bg-teal-50 border-teal-200 text-teal-800',
        gray: 'bg-gray-50 border-gray-200 text-gray-800',
        amber: 'bg-amber-50 border-amber-200 text-amber-800',
    };
    const cls = colorMap[color] || colorMap.gray;

    return (
        <div className={`border rounded-lg overflow-hidden ${cls}`}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
                <div className="flex items-center gap-2">
                    {Icon && <Icon className="h-4.5 w-4.5" />}
                    <span className="font-bold text-sm">{label}</span>
                    {badge != null && <span className="text-[10px] bg-white/60 px-1.5 py-0.5 rounded-full font-medium">{badge}</span>}
                </div>
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && <div className="bg-white border-t px-4 py-3 space-y-1">{children}</div>}
        </div>
    );
};

// ── Menu item row (shows icon + name + on/off toggle) ──
const MenuToggle = ({ icon: Icon, label, checked, onChange }) => (
    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50">
        <div className="flex items-center gap-2 text-sm text-gray-700">
            {Icon && <Icon className="h-4 w-4 text-gray-400" />}
            <span>{label}</span>
        </div>
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${checked ? 'bg-indigo-600' : 'bg-gray-200'}`}
        >
            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
    </div>
);

const PermissoesModal = ({ vendedor, onClose, onUpdated }) => {
    const [login, setLogin] = useState('');
    const [senha, setSenha] = useState('');
    const [permissoes, setPermissoes] = useState(DEFAULT_PERMISSIONS);
    const [saving, setSaving] = useState(false);
    const [todosVendedores, setTodosVendedores] = useState([]);
    const [vendedorOrigemId, setVendedorOrigemId] = useState('');
    const [clonando, setClonando] = useState(false);
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
        configService.getCategorias().then(cats => setTodasCategorias(cats || [])).catch(() => {});
        tabelaPrecoService.listar(true).then(conds => setTodasCondicoes(conds || [])).catch(() => {});
        vendedorService.listar().then(data => {
            const list = Array.isArray(data) ? data : (data?.vendedores || []);
            setTodosVendedores(list.filter(v => v.id !== vendedor?.id && v.ativo !== false));
        }).catch(() => {});
    }, [vendedor]);

    const handleClonar = async () => {
        if (!vendedorOrigemId) { toast.error('Selecione um usuário para clonar.'); return; }
        try {
            setClonando(true);
            const source = await vendedorService.obter(vendedorOrigemId);
            if (source && source.id) {
                let sourcePerms = source.permissoes || {};
                if (typeof sourcePerms === 'string') {
                    try { sourcePerms = JSON.parse(sourcePerms); } catch (e) { sourcePerms = {}; }
                }
                setPermissoes({ ...DEFAULT_PERMISSIONS, ...sourcePerms });
                toast.success(`Permissões clonadas de ${source.nome}!`);
                setVendedorOrigemId('');
            }
        } catch (error) {
            console.error('Erro ao clonar permissões:', error);
            toast.error('Erro ao buscar dados do usuário de origem.');
        } finally {
            setClonando(false);
        }
    };

    // Helpers for tab-based permissions (view/edit objects)
    const toggleView = (tab) => {
        setPermissoes(prev => ({ ...prev, [tab]: { ...prev[tab], view: !prev[tab]?.view } }));
    };
    const toggleEdit = (tab) => {
        setPermissoes(prev => ({ ...prev, [tab]: { ...prev[tab], edit: !prev[tab]?.edit } }));
    };
    const toggleBool = (key) => {
        setPermissoes(prev => ({ ...prev, [key]: !prev[key] }));
    };
    const togglePcp = (key) => {
        setPermissoes(prev => ({
            ...prev,
            pcp: { ...(prev.pcp || {}), [key]: !(prev.pcp || {})[key] }
        }));
    };
    const togglePcpAll = (val) => {
        setPermissoes(prev => ({
            ...prev,
            pcp: { itens: val, receitas: val, ordens: val, cancelarOrdens: val, agenda: val, estoque: val, sugestoes: val }
        }));
    };
    const changeClientesScope = (val) => {
        setPermissoes(prev => ({ ...prev, pedidos: { ...prev.pedidos, clientes: val } }));
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            const data = { login, permissoes };
            if (senha && senha.trim() !== '') data.senha = senha;
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

    // Count active permissions per department for badges
    const countVendas = [
        permissoes.catalogo?.view, permissoes.pedidos?.view, permissoes.rota?.view, permissoes.clientes?.view
    ].filter(Boolean).length;
    const countLogistica = [
        permissoes.Pode_Acessar_Embarque, permissoes.Pode_Ver_Todas_Entregas, permissoes.Pode_Executar_Entregas
    ].filter(Boolean).length;
    const countFinanceiro = [
        permissoes.Pode_Acessar_Caixa, permissoes.Pode_Acessar_Contas_Receber
    ].filter(Boolean).length;
    const countAdmin = [
        permissoes.produtos?.view, permissoes.vendedores?.view, permissoes.sync?.view, permissoes.Pode_Acessar_Veiculos
    ].filter(Boolean).length;
    const countEstoque = (permissoes.estoque || []).length;
    const pcpPerms = permissoes.pcp || {};
    const countPcp = [pcpPerms.itens, pcpPerms.receitas, pcpPerms.ordens, pcpPerms.cancelarOrdens, pcpPerms.agenda, pcpPerms.estoque, pcpPerms.sugestoes].filter(Boolean).length;

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
                <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">

                    {/* ── Clonagem ── */}
                    <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                        <label className="block text-sm font-bold text-indigo-900 mb-2">Copiar Permissões de Outro Usuário</label>
                        <div className="flex gap-2">
                            <select
                                className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 bg-white text-gray-900"
                                value={vendedorOrigemId}
                                onChange={e => setVendedorOrigemId(e.target.value)}
                            >
                                <option value="">Selecione um usuário para copiar...</option>
                                {todosVendedores.map(v => (
                                    <option key={v.id} value={v.id}>{v.nome}</option>
                                ))}
                            </select>
                            <button
                                onClick={handleClonar}
                                disabled={!vendedorOrigemId || clonando}
                                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                            >
                                {clonando ? 'Copiando...' : 'Copiar'}
                            </button>
                        </div>
                    </div>

                    {/* ── Login / Senha ── */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Login</label>
                            <input type="text" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                                value={login} onChange={e => setLogin(e.target.value)} placeholder="Ex: Clark" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Nova Senha</label>
                            <input type="text" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                                value={senha} onChange={e => setSenha(e.target.value)} placeholder="Deixe vazio para manter" />
                        </div>
                    </div>

                    {/* ── Admin Global ── */}
                    <div className="flex items-center justify-between bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                        <div>
                            <h4 className="font-bold text-indigo-900 text-sm">Administrador Global</h4>
                            <p className="text-xs text-indigo-700 mt-0.5">Acesso irrestrito, pula trava de ponto/veículo</p>
                        </div>
                        <button
                            type="button" role="switch" aria-checked={!!permissoes.admin}
                            onClick={() => toggleBool('admin')}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${permissoes.admin ? 'bg-indigo-600' : 'bg-gray-200'}`}
                        >
                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${permissoes.admin ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                    </div>

                    {/* ── Isento de Ponto ── */}
                    {!permissoes.admin && (
                        <div className="flex items-center justify-between bg-amber-50 p-4 rounded-lg border border-amber-200">
                            <div>
                                <h4 className="font-bold text-amber-900 text-sm">Isento de Ponto / Diário</h4>
                                <p className="text-xs text-amber-700 mt-0.5">Pula a trava de check-in diário (veículo/home office) ao fazer login</p>
                            </div>
                            <button
                                type="button" role="switch" aria-checked={!!permissoes.Isento_Ponto}
                                onClick={() => toggleBool('Isento_Ponto')}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${permissoes.Isento_Ponto ? 'bg-amber-600' : 'bg-gray-200'}`}
                            >
                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${permissoes.Isento_Ponto ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>
                    )}

                    {/* ── Tela Inicial ── */}
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                        <div className="flex items-center gap-2 mb-2">
                            <Monitor className="h-4 w-4 text-blue-700" />
                            <h4 className="font-bold text-blue-900 text-sm">Tela Inicial</h4>
                        </div>
                        <p className="text-xs text-blue-700 mb-2">Qual página abre primeiro ao fazer login (após telas obrigatórias como Diário).</p>
                        <select
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 bg-white text-gray-900"
                            value={permissoes.telaInicial || '/'}
                            onChange={e => setPermissoes(prev => ({ ...prev, telaInicial: e.target.value }))}
                        >
                            {TELAS_INICIAIS.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* ═══════════════════════════════════════════ */}
                    {/*   DEPARTAMENTOS                            */}
                    {/* ═══════════════════════════════════════════ */}

                    {/* ── DASHBOARD ── */}
                    <DeptSection label="Dashboard" icon={LayoutDashboard} color="blue" defaultOpen={false}>
                        <Toggle
                            checked={!!permissoes.Pode_Ver_Dashboard_Vendas}
                            onChange={() => toggleBool('Pode_Ver_Dashboard_Vendas')}
                            label="Ver dados de vendas"
                            sublabel="Exibe o card 'Vendas (Hoje)' e outros valores financeiros no painel do admin"
                            colorClass="bg-blue-600"
                        />
                        <Toggle
                            checked={!!permissoes.Pode_Ver_Dashboard_Admin}
                            onChange={() => toggleBool('Pode_Ver_Dashboard_Admin')}
                            label="Ver Painel Administrativo (master)"
                            sublabel="Libera o painel completo: vendas/projeção/top10/inadimplência/inativos/ruptura. Dado financeiro sensível."
                            colorClass="bg-blue-600"
                        />
                    </DeptSection>

                    {/* ── VENDAS ── */}
                    <DeptSection label="Vendas" icon={ClipboardList} color="blue" defaultOpen={true} badge={`${countVendas} menus`}>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Menus visíveis</p>
                        <MenuToggle icon={BookOpen} label="Catálogo" checked={!!permissoes.catalogo?.view} onChange={() => toggleView('catalogo')} />
                        <MenuToggle icon={ClipboardList} label="Pedidos" checked={!!permissoes.pedidos?.view} onChange={() => toggleView('pedidos')} />
                        <MenuToggle icon={FileText} label="Relatórios" checked={!!permissoes.pedidos?.view} onChange={() => toggleView('pedidos')} />
                        <MenuToggle icon={Map} label="Rota" checked={!!permissoes.pedidos?.view} onChange={() => toggleView('pedidos')} />
                        <MenuToggle icon={Target} label="Leads" checked={!!permissoes.rota?.view} onChange={() => toggleView('rota')} />
                        <MenuToggle icon={Users} label="Clientes" checked={!!permissoes.clientes?.view} onChange={() => toggleView('clientes')} />

                        {/* Sub-permissões de edição */}
                        {(permissoes.catalogo?.view || permissoes.pedidos?.view || permissoes.clientes?.view) && (
                            <>
                                <div className="border-t mt-3 pt-3">
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Permissões de edição</p>
                                </div>
                                {permissoes.catalogo?.view && (
                                    <Toggle checked={!!permissoes.catalogo?.edit} onChange={() => toggleEdit('catalogo')} label="Gerenciar Catálogo" sublabel="Pode editar preços e detalhes no catálogo" />
                                )}
                                {permissoes.pedidos?.view && (
                                    <Toggle checked={!!permissoes.pedidos?.edit} onChange={() => toggleEdit('pedidos')} label="Criar/Editar Pedidos" sublabel="Pode criar novos pedidos e editar existentes" />
                                )}
                                {permissoes.clientes?.view && (
                                    <Toggle checked={!!permissoes.clientes?.edit} onChange={() => toggleEdit('clientes')} label="Gerenciar Clientes" sublabel="Pode editar dados dos clientes" />
                                )}
                                {permissoes.rota?.view && (
                                    <Toggle checked={!!permissoes.rota?.edit} onChange={() => toggleEdit('rota')} label="Gerenciar Rota/Leads" sublabel="Pode editar rotas e leads" />
                                )}
                            </>
                        )}

                        {/* Regra de Clientes */}
                        {permissoes.pedidos?.view && (
                            <div className="border-t mt-3 pt-3">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Regra de clientes para pedidos</p>
                                <div className="flex gap-4 px-2">
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input type="radio" name="clientes" value="todos"
                                            checked={permissoes.pedidos?.clientes === 'todos'}
                                            onChange={e => changeClientesScope(e.target.value)} />
                                        <span>Todos os Clientes</span>
                                    </label>
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input type="radio" name="clientes" value="vinculados"
                                            checked={permissoes.pedidos?.clientes !== 'todos'}
                                            onChange={e => changeClientesScope(e.target.value)} />
                                        <span>Apenas Vinculados</span>
                                    </label>
                                </div>
                            </div>
                        )}

                        {/* CRM / Leads */}
                        {permissoes.rota?.view && (
                            <div className="border-t mt-3 pt-3">
                                <Toggle checked={!!permissoes.Pode_Editar_Lead} onChange={() => toggleBool('Pode_Editar_Lead')}
                                    label="Pode Editar Leads" sublabel="Permite editar leads existentes, não apenas criar novos" />
                                <Toggle checked={!!permissoes.Pode_Editar_GPS} onChange={() => toggleBool('Pode_Editar_GPS')}
                                    label="Editar GPS de Clientes" sublabel="Capturar e salvar localização GPS dos clientes na rota" />
                            </div>
                        )}

                        {/* Ajustes de pedidos */}
                        <div className="border-t mt-3 pt-3">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Ajustes em Pedidos</p>
                            <Toggle checked={!!permissoes.Pode_Reatribuir_Vendedor} onChange={() => toggleBool('Pode_Reatribuir_Vendedor')}
                                label="Reatribuir Vendedor em Pedidos" sublabel="Trocar o vendedor de pedidos existentes (ajuste apenas no app, não afeta o Conta Azul)" />
                        </div>

                        {/* Exclusão de pedidos */}
                        {permissoes.pedidos?.view && (
                            <div className="border-t mt-3 pt-3">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Exclusão de registros</p>
                                <Toggle checked={!!permissoes.Pode_Excluir_Pedido} onChange={() => toggleBool('Pode_Excluir_Pedido')}
                                    label="Excluir Pedidos" sublabel="Pedidos em status ABERTO ou ERRO" danger />
                                <Toggle checked={!!permissoes.Pode_Excluir_Especial} onChange={() => toggleBool('Pode_Excluir_Especial')}
                                    label="Excluir Pedidos Especiais" danger />
                                <Toggle checked={!!permissoes.Pode_Excluir_Bonificacao} onChange={() => toggleBool('Pode_Excluir_Bonificacao')}
                                    label="Excluir Bonificações" danger />
                                <Toggle checked={!!permissoes.Pode_Excluir_Amostra} onChange={() => toggleBool('Pode_Excluir_Amostra')}
                                    label="Excluir Amostras" danger />
                            </div>
                        )}

                        {/* Especiais */}
                        {permissoes.pedidos?.view && (
                            <div className="border-t mt-3 pt-3">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Pedidos Especiais (Sem Nota)</p>
                                <Toggle checked={!!permissoes.Pode_Criar_Especial} onChange={() => toggleBool('Pode_Criar_Especial')}
                                    label="Criar Pedido Especial" sublabel="Habilita o toggle 'Especial' ao criar pedido" />
                                <Toggle checked={!!permissoes.Pode_Aprovar_Especial} onChange={() => toggleBool('Pode_Aprovar_Especial')}
                                    label="Aprovar Pedido Especial" sublabel="Aprovar/faturar pedidos especiais pendentes" />
                                <Toggle checked={!!permissoes.Pode_Reverter_Especial} onChange={() => toggleBool('Pode_Reverter_Especial')}
                                    label="Reverter Faturamento Especial" sublabel="Reverter pedidos especiais aprovados para ABERTO" danger />

                                {/* Categorias Extras para Especiais */}
                                {!!permissoes.Pode_Criar_Especial && todasCategorias.length > 0 && (
                                    <div className="mt-3 bg-purple-50 p-3 rounded-md border border-purple-200">
                                        <h5 className="text-xs font-bold text-purple-900 mb-2">Categorias Extras (Especial)</h5>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto">
                                            {todasCategorias.map(cat => (
                                                <label key={cat} className="flex items-center gap-1.5 text-xs cursor-pointer p-1 hover:bg-purple-100 rounded">
                                                    <input type="checkbox" className="rounded border-purple-300 text-purple-600 focus:ring-purple-500 h-3.5 w-3.5"
                                                        checked={(permissoes.categoriasEspeciais || []).includes(cat)}
                                                        onChange={(e) => {
                                                            const current = permissoes.categoriasEspeciais || [];
                                                            const updated = e.target.checked ? [...current, cat] : current.filter(c => c !== cat);
                                                            setPermissoes(prev => ({ ...prev, categoriasEspeciais: updated }));
                                                        }} />
                                                    <span className="text-purple-800">{cat}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Condições de Pagamento para Especiais */}
                                {!!permissoes.Pode_Criar_Especial && todasCondicoes.length > 0 && (
                                    <div className="mt-3 bg-purple-50 p-3 rounded-md border border-purple-200">
                                        <h5 className="text-xs font-bold text-purple-900 mb-2">Condições de Pagamento (Especial)</h5>
                                        <p className="text-[10px] text-purple-700 mb-2">Se nenhuma for selecionada, todas ficam disponíveis.</p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto">
                                            {todasCondicoes.map(cond => (
                                                <label key={cond.idCondicao || cond.id} className="flex items-center gap-1.5 text-xs cursor-pointer p-1 hover:bg-purple-100 rounded">
                                                    <input type="checkbox" className="rounded border-purple-300 text-purple-600 focus:ring-purple-500 h-3.5 w-3.5"
                                                        checked={(permissoes.condicoesEspeciais || []).includes(cond.idCondicao || cond.id)}
                                                        onChange={(e) => {
                                                            const condId = cond.idCondicao || cond.id;
                                                            const current = permissoes.condicoesEspeciais || [];
                                                            const updated = e.target.checked ? [...current, condId] : current.filter(c => c !== condId);
                                                            setPermissoes(prev => ({ ...prev, condicoesEspeciais: updated }));
                                                        }} />
                                                    <span className="text-purple-800">{cond.nome || cond.descricao || cond.idCondicao}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Bonificação */}
                        {permissoes.pedidos?.view && (
                            <div className="border-t mt-3 pt-3">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Pedidos Bonificação</p>
                                <Toggle checked={!!permissoes.Pode_Criar_Bonificacao} onChange={() => toggleBool('Pode_Criar_Bonificacao')}
                                    label="Criar Bonificação" sublabel="Habilita o botão 'Bonificação' ao criar pedido" />
                                <Toggle checked={!!permissoes.Pode_Aprovar_Bonificacao} onChange={() => toggleBool('Pode_Aprovar_Bonificacao')}
                                    label="Aprovar Bonificação" />
                                <Toggle checked={!!permissoes.Pode_Reverter_Bonificacao} onChange={() => toggleBool('Pode_Reverter_Bonificacao')}
                                    label="Reverter Bonificação" danger />
                            </div>
                        )}
                    </DeptSection>

                    {/* ── LOGÍSTICA ── */}
                    <DeptSection label="Logística" icon={Truck} color="sky" badge={`${countLogistica} menus`}>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Menus visíveis</p>
                        <MenuToggle icon={PackageCheck} label="Embarque" checked={!!permissoes.Pode_Acessar_Embarque} onChange={() => toggleBool('Pode_Acessar_Embarque')} />
                        <MenuToggle icon={Truck} label="Entregas (Auditor)" checked={!!permissoes.Pode_Ver_Todas_Entregas} onChange={() => toggleBool('Pode_Ver_Todas_Entregas')} />
                        <MenuToggle icon={Truck} label="Minhas Entregas (Motorista)" checked={!!permissoes.Pode_Executar_Entregas} onChange={() => toggleBool('Pode_Executar_Entregas')} />

                        <div className="border-t mt-3 pt-3">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Permissões avançadas</p>
                            <Toggle checked={!!permissoes.Pode_Editar_Embarque} onChange={() => toggleBool('Pode_Editar_Embarque')}
                                label="Editar Carga" sublabel="Alterar data e motorista de cargas já criadas" />
                            <Toggle checked={!!permissoes.Pode_Ajustar_Entregas} onChange={() => toggleBool('Pode_Ajustar_Entregas')}
                                label="Administrador Financeiro de Entrega" sublabel="Desmanchar/alterar devoluções ou pagamentos do motorista" danger />
                        </div>
                    </DeptSection>

                    {/* ── FINANCEIRO ── */}
                    <DeptSection label="Financeiro" icon={Wallet} color="emerald" badge={`${countFinanceiro} menus`}>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Menus visíveis</p>
                        <MenuToggle icon={Wallet} label="Caixa Diário" checked={!!permissoes.Pode_Acessar_Caixa} onChange={() => toggleBool('Pode_Acessar_Caixa')} />
                        <MenuToggle icon={Receipt} label="Despesas" checked={!!permissoes.Pode_Acessar_Caixa} onChange={() => toggleBool('Pode_Acessar_Caixa')} />
                        <MenuToggle icon={Search} label="Auditoria Entregas" checked={!!permissoes.Pode_Ver_Todas_Entregas} onChange={() => toggleBool('Pode_Ver_Todas_Entregas')} />
                        <MenuToggle icon={DollarSign} label="Contas a Receber" checked={!!permissoes.Pode_Acessar_Contas_Receber} onChange={() => toggleBool('Pode_Acessar_Contas_Receber')} />

                        {permissoes.Pode_Acessar_Caixa && (
                            <div className="border-t mt-3 pt-3">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Permissões do Caixa</p>
                                <Toggle checked={!!permissoes.Pode_Editar_Caixa} onChange={() => toggleBool('Pode_Editar_Caixa')}
                                    label="Auditor Financeiro do Caixa" sublabel="Confere caixas de outros usuários, edita despesas alheias" danger />
                                <Toggle checked={!!permissoes.Pode_Baixar_Caixa} onChange={() => toggleBool('Pode_Baixar_Caixa')}
                                    label="Baixar no Caixa (Quitar CA)" sublabel="Dar baixa de entregas à vista (dinheiro/pix/cartão) no Conta Azul" />
                                <Toggle checked={!!permissoes.Pode_Fechar_Caixa} onChange={() => toggleBool('Pode_Fechar_Caixa')}
                                    label="Fechar Caixa" sublabel="Fechar o caixa do dia com snapshot dos totais" />
                                <Toggle checked={!!permissoes.Pode_Definir_Adiantamento} onChange={() => toggleBool('Pode_Definir_Adiantamento')}
                                    label="Definir Adiantamento" sublabel="Editar o valor de adiantamento do caixa diário" />
                                <Toggle checked={!!permissoes.Pode_Ver_Historico_Caixa} onChange={() => toggleBool('Pode_Ver_Historico_Caixa')}
                                    label="Ver Caixas de Outros Dias" sublabel="Navegar por datas passadas ou futuras" />
                                <Toggle checked={!!permissoes.Pode_Reverter_Caixa} onChange={() => toggleBool('Pode_Reverter_Caixa')}
                                    label="Reverter Caixa" sublabel="Reverter conferência e reabrir caixas fechados" danger />
                            </div>
                        )}

                        {permissoes.Pode_Acessar_Contas_Receber && (
                            <div className="border-t mt-3 pt-3">
                                <Toggle checked={!!permissoes.Pode_Baixar_Contas_Receber} onChange={() => toggleBool('Pode_Baixar_Contas_Receber')}
                                    label="Dar Baixa em Parcelas" sublabel="Registrar pagamentos e estornar baixas" />
                            </div>
                        )}

                        {/* Devoluções */}
                        <div className="border-t mt-3 pt-3">
                            <Toggle checked={!!permissoes.Pode_Fazer_Devolucao} onChange={() => toggleBool('Pode_Fazer_Devolucao')}
                                label="Fazer Devolução" sublabel="Registrar devoluções de pedidos entregues" />
                            {permissoes.Pode_Fazer_Devolucao && (
                                <Toggle checked={!!permissoes.Pode_Reverter_Devolucao} onChange={() => toggleBool('Pode_Reverter_Devolucao')}
                                    label="Reverter Devolução" sublabel="Desfazer devoluções já registradas" danger />
                            )}
                        </div>

                        {/* Metas */}
                        <div className="border-t mt-3 pt-3">
                            <Toggle checked={!!permissoes.Pode_Gerenciar_Metas} onChange={() => toggleBool('Pode_Gerenciar_Metas')}
                                label="Gerenciar Metas de Vendas" sublabel="Criar, editar e excluir metas mensais" icon={TrendingUp} />
                        </div>
                    </DeptSection>

                    {/* ── ADMIN ── */}
                    <DeptSection label="Administração" icon={UserCog} color="indigo" badge={`${countAdmin} menus`}>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Menus visíveis</p>
                        <MenuToggle icon={Box} label="Produtos" checked={!!permissoes.produtos?.view} onChange={() => toggleView('produtos')} />
                        <MenuToggle icon={UserCog} label="Vendedores" checked={!!permissoes.vendedores?.view} onChange={() => toggleView('vendedores')} />
                        <MenuToggle icon={Car} label="Veículos" checked={!!permissoes.Pode_Acessar_Veiculos} onChange={() => toggleBool('Pode_Acessar_Veiculos')} />
                        <MenuToggle icon={RefreshCw} label="Sincronizar" checked={!!permissoes.sync?.view} onChange={() => toggleView('sync')} />

                        <div className="border-t mt-3 pt-3">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Permissões avançadas</p>
                            {permissoes.produtos?.view && (
                                <Toggle checked={!!permissoes.produtos?.edit} onChange={() => toggleEdit('produtos')}
                                    label="Gerenciar Produtos" sublabel="Editar dados dos produtos" />
                            )}
                            {permissoes.vendedores?.view && (
                                <Toggle checked={!!permissoes.vendedores?.edit} onChange={() => toggleEdit('vendedores')}
                                    label="Gerenciar Vendedores" sublabel="Editar dados e permissões dos vendedores" />
                            )}
                            <Toggle checked={!!permissoes.Pode_Editar_Veiculos} onChange={() => toggleBool('Pode_Editar_Veiculos')}
                                label="Editar Veículos" sublabel="Cadastrar/editar/excluir veículos, lançar manutenção" danger />
                            <Toggle checked={!!permissoes.Pode_Resetar_Dados} onChange={() => toggleBool('Pode_Resetar_Dados')}
                                label="Resetar Dados" sublabel="Ferramenta de limpeza de dados (ação irreversível)" danger />
                        </div>
                    </DeptSection>

                    {/* ── PRODUÇÃO / ESTOQUE ── */}
                    <DeptSection label="Produção / Estoque" icon={Warehouse} color="teal" badge={`${countEstoque} regras`}>
                        <p className="text-xs text-gray-500 mb-3 px-2">Define o que este usuário pode fazer no painel de estoque por categoria. Sem regras = sem acesso (exceto admin).</p>
                        <div className="space-y-2">
                            {(permissoes.estoque || []).map((regra, idx) => (
                                <div key={idx} className="flex items-center gap-2 flex-wrap bg-gray-50 p-2 rounded-md">
                                    <select
                                        value={regra.categoria || ''}
                                        onChange={e => {
                                            const nova = [...(permissoes.estoque || [])];
                                            nova[idx] = { ...nova[idx], categoria: e.target.value };
                                            setPermissoes(prev => ({ ...prev, estoque: nova }));
                                        }}
                                        className="flex-1 min-w-[120px] border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    >
                                        <option value="">Todas as categorias</option>
                                        {todasCategorias.map(c => {
                                            const nome = typeof c === 'string' ? c : (c.descricao || c.nome || c.id);
                                            return <option key={nome} value={nome}>{nome}</option>;
                                        })}
                                    </select>
                                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                                        <input type="checkbox" className="rounded border-teal-300 text-teal-600 focus:ring-teal-500"
                                            checked={regra.pode?.includes('adicionar')}
                                            onChange={e => {
                                                const nova = [...(permissoes.estoque || [])];
                                                const pode = new Set(nova[idx].pode || []);
                                                e.target.checked ? pode.add('adicionar') : pode.delete('adicionar');
                                                nova[idx] = { ...nova[idx], pode: [...pode] };
                                                setPermissoes(prev => ({ ...prev, estoque: nova }));
                                            }} />
                                        Adicionar
                                    </label>
                                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                                        <input type="checkbox" className="rounded border-teal-300 text-teal-600 focus:ring-teal-500"
                                            checked={regra.pode?.includes('diminuir')}
                                            onChange={e => {
                                                const nova = [...(permissoes.estoque || [])];
                                                const pode = new Set(nova[idx].pode || []);
                                                e.target.checked ? pode.add('diminuir') : pode.delete('diminuir');
                                                nova[idx] = { ...nova[idx], pode: [...pode] };
                                                setPermissoes(prev => ({ ...prev, estoque: nova }));
                                            }} />
                                        Diminuir
                                    </label>
                                    <button
                                        onClick={() => {
                                            const nova = (permissoes.estoque || []).filter((_, i) => i !== idx);
                                            setPermissoes(prev => ({ ...prev, estoque: nova }));
                                        }}
                                        className="text-red-400 hover:text-red-600 text-lg font-light leading-none" title="Remover">×</button>
                                </div>
                            ))}
                            <button
                                onClick={() => setPermissoes(prev => ({ ...prev, estoque: [...(prev.estoque || []), { categoria: '', pode: [] }] }))}
                                className="text-sm text-teal-700 font-medium hover:text-teal-900 flex items-center gap-1 px-2"
                            >+ Adicionar regra de categoria</button>
                        </div>
                    </DeptSection>

                    {/* ── PCP ── */}
                    <DeptSection label="PCP — Producao" icon={Factory} color="amber" badge={`${countPcp} telas`}>
                        <div className="flex items-center justify-between mb-3 px-2">
                            <p className="text-xs text-gray-500">Selecione as telas do PCP que este usuario pode acessar.</p>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => togglePcpAll(true)} className="text-[10px] text-amber-700 font-medium hover:underline">Marcar todas</button>
                                <button type="button" onClick={() => togglePcpAll(false)} className="text-[10px] text-gray-500 font-medium hover:underline">Desmarcar</button>
                            </div>
                        </div>
                        <MenuToggle icon={Package} label="Subprodutos" checked={!!pcpPerms.itens} onChange={() => togglePcp('itens')} />
                        <MenuToggle icon={BookOpenIcon} label="Receitas" checked={!!pcpPerms.receitas} onChange={() => togglePcp('receitas')} />
                        <MenuToggle icon={ClipboardList} label="Ordens de Producao" checked={!!pcpPerms.ordens} onChange={() => togglePcp('ordens')} />
                        <MenuToggle icon={ClipboardList} label="Cancelar Ordens" checked={!!pcpPerms.cancelarOrdens} onChange={() => togglePcp('cancelarOrdens')} />
                        <MenuToggle icon={Play} label="Painel Operacional" checked={!!pcpPerms.ordens} onChange={() => togglePcp('ordens')} />
                        <MenuToggle icon={Calendar} label="Calendario" checked={!!pcpPerms.agenda} onChange={() => togglePcp('agenda')} />
                        <MenuToggle icon={Warehouse} label="Estoque PCP" checked={!!pcpPerms.estoque} onChange={() => togglePcp('estoque')} />
                        <MenuToggle icon={Lightbulb} label="Sugestoes de Producao" checked={!!pcpPerms.sugestoes} onChange={() => togglePcp('sugestoes')} />
                        <MenuToggle icon={BarChart3} label="Dashboard PCP" checked={!!pcpPerms.sugestoes} onChange={() => togglePcp('sugestoes')} />
                    </DeptSection>

                    {/* ── CONFIGURAÇÕES ── */}
                    <DeptSection label="Configurações" icon={Settings} color="gray">
                        <MenuToggle icon={Settings} label="Acesso às Configurações" checked={!!permissoes.configuracoes?.view} onChange={() => toggleView('configuracoes')} />
                        {permissoes.configuracoes?.view && (
                            <Toggle checked={!!permissoes.configuracoes?.edit} onChange={() => toggleEdit('configuracoes')}
                                label="Gerenciar Configurações" sublabel="Pode editar tabelas de preços, bancos, metas, categorias" />
                        )}
                    </DeptSection>

                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3 bg-gray-50 rounded-b-lg">
                    <button onClick={onClose}
                        className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                        Cancelar
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">
                        <Save className="h-4 w-4 mr-2" />
                        Salvar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PermissoesModal;
