import React, { useState, useEffect } from 'react';
import { Pencil, Save, X, Search, Plus, Mail, Shield, UserX, UserCheck, User, MessageCircle, Phone, Bell, BellOff, Repeat, Check, Link2, Bot } from 'lucide-react';
import vendedorService from '../../../services/vendedorService';
import PermissoesModal from './PermissoesModal';
import NovoUsuarioModal from './NovoUsuarioModal';
import { useAuth } from '../../../contexts/AuthContext';
import toast from 'react-hot-toast';

const FORMAS_OPTIONS = [
    { value: 'PRESENCIAL', label: 'Presencial', icon: User },
    { value: 'WHATSAPP', label: 'WhatsApp', icon: MessageCircle },
    { value: 'TELEFONE', label: 'Telefone', icon: Phone },
];

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const iniciais = (n) => (n || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

const ListaVendedores = () => {
    const { user } = useAuth();
    const isAdmin = user?.permissoes?.admin === true;
    const [vendedores, setVendedores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [mostrarInativos, setMostrarInativos] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [permissionsModalVendedor, setPermissionsModalVendedor] = useState(null);
    // Modal de criação/vínculo com o cadastro de pessoas (sync com o CA desligado em 25/07/2026)
    const [novoModal, setNovoModal] = useState(null); // null | { modo: 'criar' } | { modo: 'vincular', vendedor }

    const handleToggleForma = async (vendedor, formaValue) => {
        const atual = vendedor.formasAtendimentoVisiveis || [];
        const jaAtivo = atual.includes(formaValue);
        const novas = jaAtivo ? atual.filter(v => v !== formaValue) : [...atual, formaValue];
        try {
            const updated = await vendedorService.atualizar(vendedor.id, { formasAtendimentoVisiveis: novas });
            setVendedores(vendedores.map(v => v.id === vendedor.id ? { ...vendedor, ...updated } : v));
            toast.success(`${vendedor.nome}: formas atualizadas`);
        } catch {
            toast.error('Erro ao salvar formas de atendimento');
        }
    };

    const handleToggleAlertaFaturamento = async (vendedor) => {
        const novoValor = !(vendedor.alertaFaturamento !== false);
        try {
            const updated = await vendedorService.atualizar(vendedor.id, { alertaFaturamento: novoValor });
            setVendedores(vendedores.map(v => v.id === vendedor.id ? { ...vendedor, ...updated } : v));
            toast.success(`${vendedor.nome}: alerta faturamento ${novoValor ? 'ativado' : 'desativado'}`);
        } catch {
            toast.error('Erro ao salvar alerta de faturamento');
        }
    };

    // Aviso de pedido especial convertido em NF (popup a cada 5 min p/ faturamento)
    const handleToggleAlertaConvertido = async (vendedor) => {
        const novoValor = !vendedor.alertaPedidoConvertido;
        try {
            const updated = await vendedorService.atualizar(vendedor.id, { alertaPedidoConvertido: novoValor });
            setVendedores(vendedores.map(v => v.id === vendedor.id ? { ...vendedor, ...updated } : v));
            toast.success(`${vendedor.nome}: aviso de pedido convertido ${novoValor ? 'ativado' : 'desativado'}`);
        } catch {
            toast.error('Erro ao salvar aviso de pedido convertido');
        }
    };

    const fetchVendedores = async () => {
        try {
            setLoading(true);
            // listarTodos: esta é a tela de administração — precisa mostrar também quem
            // tem acesso externo (contabilidade/parceiro), que some dos demais seletores.
            const data = await vendedorService.listarTodos();
            setVendedores(data);
        } catch (error) {
            console.error('Erro ao buscar vendedores:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchVendedores(); }, []);

    const handleEdit = (vendedor) => {
        setEditingId(vendedor.id);
        setEditForm({
            email: vendedor.email || '',
            telefone: vendedor.telefone || '',
            percentualFlex: vendedor.percentualFlex !== undefined ? Number(vendedor.percentualFlex) : 0,
            maxDescontoFlex: vendedor.maxDescontoFlex !== undefined ? vendedor.maxDescontoFlex : 100,
            nomeVendedorBotHardt: vendedor.nomeVendedorBotHardt || '',
            // Só admin pode gravar este campo — para os demais o PUT nem envia
            ...(isAdmin ? { acessoExterno: vendedor.acessoExterno === true } : {})
        });
    };

    const handleCancel = () => { setEditingId(null); setEditForm({}); };

    const handleSave = async (id) => {
        try {
            const updated = await vendedorService.atualizar(id, editForm);
            setVendedores(vendedores.map(v => v.id === id ? { ...v, ...updated } : v));
            setEditingId(null);
            // Recarrega para obter flexDinamico atualizado
            fetchVendedores();
        } catch (error) {
            console.error('Erro ao salvar:', error);
            toast.error('Erro ao conectar com servidor');
        }
    };

    const handleToggleAtivo = async (vendedor) => {
        const novoStatus = !vendedor.ativo;
        const acao = novoStatus ? 'reativar' : 'inativar';
        if (!window.confirm(`Deseja ${acao} o usuário ${vendedor.nome}?${!novoStatus ? '\n\nEle não poderá mais acessar a plataforma e não será possível emitir pedidos para clientes vinculados a ele.' : ''}`)) return;
        try {
            const updated = await vendedorService.atualizar(vendedor.id, { ativo: novoStatus });
            setVendedores(vendedores.map(v => v.id === vendedor.id ? { ...vendedor, ...updated } : v));
            toast.success(`${vendedor.nome} ${novoStatus ? 'reativado' : 'inativado'} com sucesso`);
        } catch {
            toast.error('Erro ao alterar status do vendedor');
        }
    };

    // Após criar: recarrega e já abre o painel de permissões do usuário novo
    const handleCriado = (criado) => {
        setNovoModal(null);
        fetchVendedores();
        if (criado) setPermissionsModalVendedor(criado);
    };

    const filtered = vendedores.filter(v => {
        const matchSearch = v.nome.toLowerCase().includes(searchTerm.toLowerCase());
        if (mostrarInativos) return matchSearch;
        return matchSearch && v.ativo !== false;
    });

    // Vínculo com o cadastro de pessoas — posição fixa sob o nome (substitui o código do CA)
    const Vinculo = ({ vendedor }) => vendedor.clienteUuid ? (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary mt-0.5">
            <Check className="h-3 w-3" /> Cadastro vinculado
        </span>
    ) : (
        <button
            onClick={() => setNovoModal({ modo: 'vincular', vendedor })}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 hover:text-amber-800 border-b border-dashed border-amber-400 mt-0.5"
        >
            <Plus className="h-3 w-3" /> Vincular cadastro
        </button>
    );

    // Nome usado no Bot Hardt (integração do site com o WhatsApp) — mostrado sob o nome
    const BotNome = ({ vendedor }) => vendedor.nomeVendedorBotHardt ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 mt-0.5 truncate max-w-full" title={`Nome usado no Bot Hardt: ${vendedor.nomeVendedorBotHardt}`}>
            <Bot className="h-3 w-3 flex-shrink-0" /> {vendedor.nomeVendedorBotHardt}
        </span>
    ) : null;

    const AJUDA_BOT = 'Copie exatamente o valor mostrado no cadastro da pessoa em Painel Hardt → Equipe → Editar → Nome usado no Bot Hardt.';

    const AJUDA_EXTERNO = 'Acesso externo (contabilidade, parceiro): a pessoa continua entrando no app e usando o que a permissão liberar, mas some de todo seletor de vendedor, motorista e equipe — caixa, pedidos, clientes, metas, tarefas, cobrança e delivery.';

    // Selo na linha: avisa que a pessoa não faz parte da operação
    const SeloExterno = ({ vendedor }) => vendedor.acessoExterno ? (
        <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-bold flex-shrink-0" title={AJUDA_EXTERNO}>EXTERNO</span>
    ) : null;

    // Só admin grava o campo (o backend recusa os demais) — para os outros nem aparece
    const CampoExterno = () => isAdmin ? (
        <label className="flex items-start gap-2 mt-2 cursor-pointer" title={AJUDA_EXTERNO}>
            <input
                type="checkbox"
                checked={!!editForm.acessoExterno}
                onChange={e => setEditForm({ ...editForm, acessoExterno: e.target.checked })}
                className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span className="text-[10px] leading-tight text-gray-600">
                <span className="font-semibold text-gray-800">Acesso externo</span> (contabilidade/parceiro) — não aparece como vendedor
            </span>
        </label>
    ) : null;

    // Formas de atendimento como controle segmentado uniforme (mesma largura em todas as linhas)
    const FormasSegmento = ({ vendedor }) => (
        <div className="inline-flex border border-gray-200 rounded-full overflow-hidden bg-white">
            {FORMAS_OPTIONS.map((f, i) => {
                const Icon = f.icon;
                const ativo = (vendedor.formasAtendimentoVisiveis || []).includes(f.value);
                return (
                    <button
                        key={f.value}
                        type="button"
                        onClick={() => handleToggleForma(vendedor, f.value)}
                        title={`${f.label}: ${ativo ? 'visível' : 'oculto'}`}
                        className={`w-9 h-8 flex items-center justify-center transition-colors ${i > 0 ? 'border-l border-gray-100' : ''} ${ativo ? 'bg-mint text-primaryDark' : 'text-gray-300 hover:text-primaryDark'}`}
                    >
                        <Icon className="h-3.5 w-3.5" />
                    </button>
                );
            })}
        </div>
    );

    // Ações com área de toque uniforme
    const Acoes = ({ vendedor }) => (
        <div className="flex justify-end gap-0.5">
            <button onClick={() => handleToggleAlertaFaturamento(vendedor)} className={`p-2 rounded-full hover:bg-gray-100 ${vendedor.alertaFaturamento !== false ? 'text-amber-500' : 'text-gray-300'}`} title={vendedor.alertaFaturamento !== false ? 'Alerta faturamento: ligado' : 'Alerta faturamento: desligado'}>
                {vendedor.alertaFaturamento !== false ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            </button>
            <button onClick={() => handleToggleAlertaConvertido(vendedor)} className={`p-2 rounded-full hover:bg-gray-100 ${vendedor.alertaPedidoConvertido ? 'text-orange-600' : 'text-gray-300'}`} title={vendedor.alertaPedidoConvertido ? 'Aviso de pedido convertido: ligado' : 'Aviso de pedido convertido: desligado'}>
                <Repeat className="h-4 w-4" />
            </button>
            <button onClick={() => setPermissionsModalVendedor(vendedor)} className="p-2 rounded-full hover:bg-gray-100 text-indigo-500" title="Acessos e Permissões"><Shield className="h-4 w-4" /></button>
            <button onClick={() => handleEdit(vendedor)} className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600" title="Editar"><Pencil className="h-4 w-4" /></button>
            <button onClick={() => handleToggleAtivo(vendedor)} className={`p-2 rounded-full hover:bg-gray-100 ${vendedor.ativo === false ? 'text-green-600' : 'text-red-400'}`} title={vendedor.ativo === false ? 'Reativar' : 'Inativar'}>
                {vendedor.ativo === false ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
            </button>
        </div>
    );

    const inputEditCls = "w-full border border-gray-300 rounded px-2 py-1.5 text-xs bg-white text-gray-900 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none";

    return (
        <div className="w-full max-w-full px-3 md:px-6 lg:px-8 py-4 md:py-8">
            {/* Cabeçalho */}
            <div className="flex flex-col md:flex-row md:justify-between md:items-end mb-4 md:mb-6 gap-3">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900">Usuários</h1>
                    <p className="mt-0.5 text-xs md:text-sm text-gray-500">Gerencie limites de Flex e logísticas da equipe</p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer whitespace-nowrap">
                        <input type="checkbox" checked={mostrarInativos} onChange={e => setMostrarInativos(e.target.checked)} className="rounded border-gray-300 text-primary focus:ring-primary h-3.5 w-3.5" />
                        Mostrar inativos
                    </label>
                    <div className="relative flex-1 md:flex-none">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input type="text" placeholder="Buscar usuário..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full md:w-48 pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-full bg-white focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                    </div>
                    {isAdmin && (
                        <button onClick={() => setNovoModal({ modo: 'criar' })} className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm flex items-center gap-1.5 whitespace-nowrap min-h-[40px]">
                            <Plus className="h-4 w-4" /> Novo Usuário
                        </button>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Barra do card */}
                <div className="flex items-center justify-between px-4 md:px-5 py-3 border-b border-gray-100">
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Equipe · {filtered.length} usuário{filtered.length === 1 ? '' : 's'}</span>
                    <div className="hidden md:flex items-center gap-4 text-[11px] text-gray-500">
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary"></span> vinculado ao cadastro</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500"></span> aguardando vínculo</span>
                    </div>
                </div>

                {/* Desktop: tabela */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full table-fixed divide-y divide-gray-100">
                        <thead>
                            <tr>
                                <th className="w-[22%] px-4 py-3 text-left text-[10.5px] font-bold text-gray-400 uppercase tracking-widest">Usuário</th>
                                <th className="w-[18%] px-4 py-3 text-left text-[10.5px] font-bold text-gray-400 uppercase tracking-widest">E-mail</th>
                                <th className="w-[12%] px-4 py-3 text-left text-[10.5px] font-bold text-gray-400 uppercase tracking-widest">Telefone</th>
                                <th className="w-[8%] px-4 py-3 text-right text-[10.5px] font-bold text-gray-400 uppercase tracking-widest" title="% do valor líquido de vendas dos últimos 30 dias">% Flex</th>
                                <th className="w-[7%] px-4 py-3 text-right text-[10.5px] font-bold text-gray-400 uppercase tracking-widest" title="% máximo de desconto por item">% Desc.</th>
                                <th className="w-[11%] px-4 py-3 text-right text-[10.5px] font-bold text-gray-400 uppercase tracking-widest" title="Flex disponível calculado sobre os últimos 30 dias">Flex disp. (30d)</th>
                                <th className="w-[10%] px-4 py-3 text-center text-[10.5px] font-bold text-gray-400 uppercase tracking-widest">Formas</th>
                                <th className="w-[12%] px-4 py-3 text-right text-[10.5px] font-bold text-gray-400 uppercase tracking-widest">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan="8" className="px-4 py-6 text-center text-sm text-gray-500">Carregando...</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan="8" className="px-4 py-6 text-center text-sm text-gray-500">Nenhum usuário encontrado.</td></tr>
                            ) : filtered.map(vendedor => {
                                const flex = vendedor.flexDinamico || {};
                                return editingId === vendedor.id ? (
                                    <tr key={vendedor.id} className="bg-mint/30">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-mint text-primaryDark flex items-center justify-center text-xs font-bold">{iniciais(vendedor.nome)}</div>
                                                <span className="font-bold text-sm text-gray-900 truncate">{vendedor.nome}</span>
                                            </div>
                                            <div className="mt-2">
                                                <label className="text-[10px] text-gray-500 block mb-0.5" title={AJUDA_BOT}>Nome usado no Bot Hardt</label>
                                                <input className={inputEditCls} value={editForm.nomeVendedorBotHardt} onChange={e => setEditForm({ ...editForm, nomeVendedorBotHardt: e.target.value })} placeholder="ex.: João" title={AJUDA_BOT} />
                                            </div>
                                            <CampoExterno />
                                        </td>
                                        <td className="px-4 py-3"><input className={inputEditCls} value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} type="email" /></td>
                                        <td className="px-4 py-3"><input className={inputEditCls} value={editForm.telefone} onChange={e => setEditForm({ ...editForm, telefone: e.target.value })} type="tel" placeholder="(xx) xxxxx-xxxx" /></td>
                                        <td className="px-4 py-3"><input className={`${inputEditCls} text-right`} value={editForm.percentualFlex} onChange={e => setEditForm({ ...editForm, percentualFlex: e.target.value })} type="number" step="0.1" min="0" max="100" /></td>
                                        <td className="px-4 py-3"><input className={`${inputEditCls} text-right`} value={editForm.maxDescontoFlex} onChange={e => setEditForm({ ...editForm, maxDescontoFlex: e.target.value })} type="number" step="0.01" min="0" max="100" /></td>
                                        <td className="px-4 py-3 text-right text-xs text-gray-400 italic">calculado</td>
                                        <td className="px-4 py-3 text-center"><FormasSegmento vendedor={vendedor} /></td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex justify-end gap-1.5">
                                                <button onClick={() => handleSave(vendedor.id)} className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary hover:bg-primaryDark text-white text-xs font-semibold rounded-full"><Save className="h-3.5 w-3.5" /> Salvar</button>
                                                <button onClick={handleCancel} className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 text-gray-600 text-xs font-semibold rounded-full hover:bg-gray-100"><X className="h-3.5 w-3.5" /> Cancelar</button>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    <tr key={vendedor.id} className={vendedor.ativo === false ? 'opacity-50' : 'hover:bg-gray-50/60'}>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-mint text-primaryDark flex items-center justify-center text-xs font-bold">{iniciais(vendedor.nome)}</div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-bold text-sm text-gray-900 truncate">{vendedor.nome}</span>
                                                        {vendedor.ativo === false && <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold flex-shrink-0">INATIVO</span>}
                                                        <SeloExterno vendedor={vendedor} />
                                                    </div>
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <Vinculo vendedor={vendedor} />
                                                        <BotNome vendedor={vendedor} />
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="text-xs text-gray-500 truncate" title={vendedor.email || ''}>{vendedor.email || <span className="text-gray-300">—</span>}</div>
                                        </td>
                                        {/* Telefone NUNCA quebra linha (número cortado é inútil; e-mail é quem trunca) */}
                                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">{vendedor.telefone || <span className="text-gray-300">—</span>}</td>
                                        <td className="px-4 py-3 text-right whitespace-nowrap text-xs font-semibold text-gray-700" title={flex.orcamento > 0 ? `Orçamento ≈ R$ ${fmt(flex.orcamento)}` : undefined}>
                                            {Number(vendedor.percentualFlex || 0).toFixed(1).replace('.', ',')}%
                                        </td>
                                        <td className="px-4 py-3 text-right whitespace-nowrap text-xs text-gray-500">
                                            {Number(vendedor.maxDescontoFlex !== undefined ? vendedor.maxDescontoFlex : 100).toFixed(0)}%
                                        </td>
                                        <td className="px-4 py-3 text-right whitespace-nowrap text-xs" title={flex.orcamento > 0 ? `Usado: R$ ${fmt(Math.abs(flex.flexUsado || 0))} · Orçamento: R$ ${fmt(flex.orcamento)}` : undefined}>
                                            <span className={(flex.disponivel ?? 0) < 0 ? 'text-red-600 font-bold' : 'text-green-700 font-semibold'}>
                                                {(flex.disponivel ?? 0) < 0 ? '−' : ''}R$ {fmt(Math.abs(flex.disponivel ?? 0))}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center"><FormasSegmento vendedor={vendedor} /></td>
                                        <td className="px-4 py-3"><Acoes vendedor={vendedor} /></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Mobile: cards */}
                <div className="md:hidden divide-y divide-gray-100">
                    {loading ? (
                        <div className="text-center py-8 text-sm text-gray-500">Carregando...</div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-8 text-sm text-gray-500">Nenhum usuário encontrado.</div>
                    ) : filtered.map(vendedor => {
                        const flex = vendedor.flexDinamico || {};
                        return (
                            <div key={vendedor.id} className={`p-4 ${vendedor.ativo === false ? 'opacity-50' : ''}`}>
                                <div className="flex items-center gap-3">
                                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-mint text-primaryDark flex items-center justify-center text-sm font-bold">{iniciais(vendedor.nome)}</div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            <p className="font-bold text-sm text-gray-900 truncate">{vendedor.nome}</p>
                                            {vendedor.ativo === false && <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold flex-shrink-0">INATIVO</span>}
                                            <SeloExterno vendedor={vendedor} />
                                        </div>
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Vinculo vendedor={vendedor} />
                                            <BotNome vendedor={vendedor} />
                                        </div>
                                    </div>
                                    <div className="flex gap-0.5 flex-shrink-0">
                                        <button onClick={() => setPermissionsModalVendedor(vendedor)} className="p-2 rounded-full text-indigo-500 hover:bg-gray-100" title="Acessos e Permissões"><Shield className="h-4 w-4" /></button>
                                        <button onClick={() => handleEdit(vendedor)} className="p-2 rounded-full text-gray-400 hover:bg-gray-100" title="Editar"><Pencil className="h-4 w-4" /></button>
                                    </div>
                                </div>

                                {editingId === vendedor.id ? (
                                    <div className="space-y-2 mt-3 pt-3 border-t border-gray-100">
                                        <input className={inputEditCls} value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} type="email" placeholder="E-mail" />
                                        <input className={inputEditCls} value={editForm.telefone} onChange={e => setEditForm({ ...editForm, telefone: e.target.value })} type="tel" placeholder="Telefone (xx) xxxxx-xxxx" />
                                        <div>
                                            <label className="text-[10px] text-gray-500 block mb-0.5">Nome usado no Bot Hardt</label>
                                            <input className={inputEditCls} value={editForm.nomeVendedorBotHardt} onChange={e => setEditForm({ ...editForm, nomeVendedorBotHardt: e.target.value })} placeholder="ex.: João" title={AJUDA_BOT} />
                                            <p className="text-[10px] text-gray-400 mt-0.5">{AJUDA_BOT}</p>
                                        </div>
                                        <CampoExterno />
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="text-[10px] text-gray-500 block mb-0.5">% Flex (sobre vendas 30d)</label>
                                                <input className={inputEditCls} value={editForm.percentualFlex} onChange={e => setEditForm({ ...editForm, percentualFlex: e.target.value })} type="number" step="0.1" min="0" max="100" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-gray-500 block mb-0.5">% Máx Desc. (por item)</label>
                                                <input className={inputEditCls} value={editForm.maxDescontoFlex} onChange={e => setEditForm({ ...editForm, maxDescontoFlex: e.target.value })} type="number" />
                                            </div>
                                        </div>
                                        <div className="flex gap-2 pt-1">
                                            <button onClick={() => handleSave(vendedor.id)} className="flex-1 bg-primary hover:bg-primaryDark text-white text-xs font-semibold py-2.5 rounded-full flex items-center justify-center gap-1 min-h-[44px]"><Save className="h-3.5 w-3.5" /> Salvar</button>
                                            <button onClick={handleCancel} className="px-4 py-2.5 border border-gray-300 text-gray-600 text-xs font-semibold rounded-full min-h-[44px]">Cancelar</button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {/* Contato numa linha só: e-mail trunca, telefone nunca quebra */}
                                        <div className="flex items-center gap-2 mt-2.5 text-xs text-gray-500 min-w-0">
                                            <span className="truncate min-w-0">{vendedor.email || '—'}</span>
                                            <span className="text-gray-300 flex-shrink-0">·</span>
                                            <span className="whitespace-nowrap flex-shrink-0">{vendedor.telefone || '—'}</span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden mt-3">
                                            <div className="bg-gray-50/80 px-2 py-2 text-center">
                                                <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400">% Flex</div>
                                                <div className="text-sm font-bold text-gray-800 mt-0.5">{Number(vendedor.percentualFlex || 0).toFixed(1).replace('.', ',')}%</div>
                                            </div>
                                            <div className="bg-gray-50/80 px-2 py-2 text-center">
                                                <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400">% Desc.</div>
                                                <div className="text-sm font-bold text-gray-800 mt-0.5">{Number(vendedor.maxDescontoFlex !== undefined ? vendedor.maxDescontoFlex : 100).toFixed(0)}%</div>
                                            </div>
                                            <div className="bg-gray-50/80 px-2 py-2 text-center">
                                                <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Flex disp. 30d</div>
                                                <div className={`text-sm font-bold mt-0.5 whitespace-nowrap ${(flex.disponivel ?? 0) < 0 ? 'text-red-600' : 'text-green-700'}`}>
                                                    {(flex.disponivel ?? 0) < 0 ? '−' : ''}R$ {fmt(Math.abs(flex.disponivel ?? 0))}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between mt-3">
                                            <FormasSegmento vendedor={vendedor} />
                                            <div className="flex gap-0.5">
                                                <button onClick={() => handleToggleAlertaFaturamento(vendedor)} className={`p-2 rounded-full hover:bg-gray-100 ${vendedor.alertaFaturamento !== false ? 'text-amber-500' : 'text-gray-300'}`} title="Alerta faturamento">
                                                    {vendedor.alertaFaturamento !== false ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                                                </button>
                                                <button onClick={() => handleToggleAlertaConvertido(vendedor)} className={`p-2 rounded-full hover:bg-gray-100 ${vendedor.alertaPedidoConvertido ? 'text-orange-600' : 'text-gray-300'}`} title="Aviso de pedido convertido">
                                                    <Repeat className="h-4 w-4" />
                                                </button>
                                                <button onClick={() => handleToggleAtivo(vendedor)} className={`p-2 rounded-full hover:bg-gray-100 ${vendedor.ativo === false ? 'text-green-600' : 'text-red-400'}`} title={vendedor.ativo === false ? 'Reativar' : 'Inativar'}>
                                                    {vendedor.ativo === false ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {permissionsModalVendedor && (
                <PermissoesModal
                    vendedor={permissionsModalVendedor}
                    onClose={() => setPermissionsModalVendedor(null)}
                    onUpdated={() => { setPermissionsModalVendedor(null); fetchVendedores(); }}
                />
            )}

            {novoModal && (
                <NovoUsuarioModal
                    modo={novoModal.modo}
                    vendedor={novoModal.vendedor}
                    onClose={() => setNovoModal(null)}
                    onDone={novoModal.modo === 'criar' ? handleCriado : () => { setNovoModal(null); fetchVendedores(); }}
                />
            )}
        </div>
    );
};

export default ListaVendedores;
