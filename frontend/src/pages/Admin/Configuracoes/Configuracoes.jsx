import React, { useEffect, useState } from 'react';
import configService from '../../../services/configService';
import vendedorService from '../../../services/vendedorService';
import { Save, AlertCircle, CheckCircle, Plus, X, ClipboardList, Trash2, Loader2, ScrollText, MapPin, Zap, Target, UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import RotasAtivasPreview from './RotasAtivasPreview';
import { useAuth } from '../../../contexts/AuthContext';
import api from '../../../services/api';
import caixaService from '../../../services/caixaService';

const ORIGENS_PADRAO = [
    { value: 'VISITA_VENDEDOR', label: 'Visita do vendedor' },
    { value: 'INDICACAO', label: 'Indicação' },
    { value: 'WHATSAPP', label: 'WhatsApp' },
    { value: 'CLIENTE_PEDIU_CONTATO', label: 'Cliente que pediu contato' },
    { value: 'PESQUISA', label: 'Pesquisa' },
    { value: 'REATIVACAO', label: 'Reativação cliente antigo' },
];

const ACOES_PADRAO = [
    { value: 'NOVO', label: 'Novo' },
    { value: 'VISITAR', label: 'Visitar' },
    { value: 'MANDAR_WHATSAPP', label: 'Mandar WhatsApp' },
    { value: 'LIGAR', label: 'Ligar' },
    { value: 'LEVAR_AMOSTRA', label: 'Levar amostra' },
    { value: 'AGUARDO_RETORNO', label: 'Aguardo retorno' },
    { value: 'SEM_POTENCIAL', label: 'Sem potencial' },
];

const TIPOS_PADRAO = [
    { value: 'VISITA', label: 'Visita Presencial' },
    { value: 'AMOSTRA', label: 'Amostra' },
    { value: 'LIGACAO', label: 'Ligação' },
    { value: 'WHATSAPP', label: 'WhatsApp' },
    { value: 'OUTROS', label: 'Outros' },
];

const Configuracoes = () => {
    const { user } = useAuth();
    const [categorias, setCategorias] = useState([]);
    const [selectedCategorias, setSelectedCategorias] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);

    // Tipos de Atendimento
    const [tipos, setTipos] = useState([]);
    const [novoTipo, setNovoTipo] = useState('');
    const [savingTipos, setSavingTipos] = useState(false);

    // Origens do Lead
    const [origens, setOrigens] = useState([]);
    const [novaOrigem, setNovaOrigem] = useState('');
    const [savingOrigens, setSavingOrigens] = useState(false);

    // Ações do Atendimento (clientes)
    const [acoes, setAcoes] = useState([]);
    const [novaAcao, setNovaAcao] = useState('');
    const [savingAcoes, setSavingAcoes] = useState(false);

    // Ações do Lead
    const [acoesLead, setAcoesLead] = useState([]);
    const [novaAcaoLead, setNovaAcaoLead] = useState('');
    const [savingAcoesLead, setSavingAcoesLead] = useState(false);

    // Vendedores (para responsável padrão por ação)
    const [vendedores, setVendedores] = useState([]);

    // Tarefas Automáticas
    const [tarefasAuto, setTarefasAuto] = useState({
        pos_venda: { ativo: false, acao_key: 'POS_VENDA', acao_label: 'Acompanhamento pós-venda', dias_apos: 7, responsavel_id: '' },
        reativacao: { ativo: false, acao_key: 'REATIVAR', acao_label: 'Reativar cliente', dias_vencimento: 3, responsavel_id: '' }
    });
    const [savingTarefasAuto, setSavingTarefasAuto] = useState(false);

    // Reset de dados
    const [resetGrupos, setResetGrupos] = useState([]);
    const [resettingGroup, setResettingGroup] = useState(null);
    const podeResetar = user?.permissoes?.admin || user?.permissoes?.Pode_Resetar_Dados;

    // Log de auditoria
    const [auditLogs, setAuditLogs] = useState([]);
    const isAdmin = user?.permissoes?.admin || user?.permissoes?.Pode_Editar_Caixa;

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [cats, currentConfig, tiposConfig, origensConfig, acoesConfig, acoesLeadConfig, vendedoresData, grupos, logs, tarefasAutoConfig] = await Promise.all([
                configService.getCategorias(),
                configService.get('categorias_vendas'),
                configService.get('tipos_atendimento').catch(() => null),
                configService.get('origens_lead').catch(() => null),
                configService.get('acoes_atendimento').catch(() => null),
                configService.get('acoes_lead').catch(() => null),
                vendedorService.listar().catch(() => []),
                podeResetar ? api.get('/admin/reset-grupos').then(r => r.data).catch(() => []) : Promise.resolve(null),
                isAdmin ? caixaService.getAuditLogs().catch(() => []) : Promise.resolve(null),
                configService.get('tarefas_automaticas').catch(() => null)
            ]);
            setCategorias(cats);
            setSelectedCategorias(Array.isArray(currentConfig) ? currentConfig : []);
            setTipos(Array.isArray(tiposConfig) && tiposConfig.length > 0 ? tiposConfig : TIPOS_PADRAO);
            setOrigens(Array.isArray(origensConfig) && origensConfig.length > 0 ? origensConfig : ORIGENS_PADRAO);
            setAcoes(Array.isArray(acoesConfig) && acoesConfig.length > 0 ? acoesConfig : ACOES_PADRAO);
            setAcoesLead(Array.isArray(acoesLeadConfig) && acoesLeadConfig.length > 0 ? acoesLeadConfig : ACOES_PADRAO);
            if (Array.isArray(vendedoresData)) setVendedores(vendedoresData.filter(v => v.ativo));
            if (grupos) setResetGrupos(grupos);
            if (logs) setAuditLogs(logs);
            if (tarefasAutoConfig && typeof tarefasAutoConfig === 'object') {
                setTarefasAuto(prev => ({
                    pos_venda: { ...prev.pos_venda, ...tarefasAutoConfig.pos_venda },
                    reativacao: { ...prev.reativacao, ...tarefasAutoConfig.reativacao }
                }));
            }
        } catch (error) {
            console.error('Erro ao carregar configurações:', error);
            setMessage({ type: 'error', text: 'Erro ao carregar dados.' });
        } finally {
            setLoading(false);
        }
    };

    const handleResetGrupo = async (grupoId, grupoLabel) => {
        if (!window.confirm(`Tem certeza que deseja limpar "${grupoLabel}"?\n\nEsta ação é irreversível!`)) return;
        const confirmacao = window.prompt('Digite CONFIRMO_RESET para confirmar:');
        if (confirmacao !== 'CONFIRMO_RESET') {
            toast.error('Confirmação inválida. Reset cancelado.');
            return;
        }
        try {
            setResettingGroup(grupoId);
            const { data } = await api.delete(`/admin/reset/${grupoId}`, { data: { confirmacao: 'CONFIRMO_RESET' } });
            toast.success(`${grupoLabel} limpo com sucesso!`);
            console.log('Reset resultado:', data.detalhes);
        } catch (error) {
            toast.error('Erro ao executar reset: ' + (error.response?.data?.error || error.message));
        } finally {
            setResettingGroup(null);
        }
    };

    const handleResetTotal = async () => {
        if (!window.confirm('ATENÇÃO: Isso vai limpar TODOS os dados transacionais!\n\nEsta ação é irreversível!')) return;
        const confirmacao = window.prompt('Digite CONFIRMO_RESET_TOTAL para confirmar:');
        if (confirmacao !== 'CONFIRMO_RESET_TOTAL') {
            toast.error('Confirmação inválida. Reset cancelado.');
            return;
        }
        try {
            setResettingGroup('__total__');
            const { data } = await api.delete('/admin/reset-transacional', { data: { confirmacao: 'CONFIRMO_RESET_TOTAL' } });
            toast.success('Todos os dados transacionais foram limpos!');
            console.log('Reset total resultado:', data.detalhes);
        } catch (error) {
            toast.error('Erro ao executar reset: ' + (error.response?.data?.error || error.message));
        } finally {
            setResettingGroup(null);
        }
    };

    const handleToggleCategoria = (cat) => {
        setSelectedCategorias(prev =>
            prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
        );
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setMessage(null);
            await configService.save('categorias_vendas', selectedCategorias);
            setMessage({ type: 'success', text: 'Configurações salvas com sucesso!' });
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            console.error('Erro ao salvar:', error);
            setMessage({ type: 'error', text: 'Erro ao salvar configurações.' });
        } finally {
            setSaving(false);
        }
    };

    const handleAdicionarTipo = () => {
        const label = novoTipo.trim();
        if (!label) return;
        const value = label.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
        if (tipos.some(t => t.value === value || t.label.toLowerCase() === label.toLowerCase())) {
            toast.error('Já existe um tipo com este nome.');
            return;
        }
        setTipos(prev => [...prev, { value, label }]);
        setNovoTipo('');
    };

    const handleRemoverTipo = (value) => {
        const isPadrao = TIPOS_PADRAO.some(t => t.value === value);
        if (isPadrao) {
            if (!window.confirm('Este é um tipo padrão. Tem certeza que deseja remover?')) return;
        }
        setTipos(prev => prev.filter(t => t.value !== value));
    };

    const handleSalvarTipos = async () => {
        try {
            setSavingTipos(true);
            await configService.save('tipos_atendimento', tipos);
            toast.success('Tipos de atendimento salvos!');
        } catch {
            toast.error('Erro ao salvar tipos de atendimento.');
        } finally {
            setSavingTipos(false);
        }
    };

    // Origens do Lead handlers
    const handleAdicionarOrigem = () => {
        const label = novaOrigem.trim();
        if (!label) return;
        const value = label.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
        if (origens.some(o => o.value === value || o.label.toLowerCase() === label.toLowerCase())) {
            toast.error('Já existe uma origem com este nome.');
            return;
        }
        setOrigens(prev => [...prev, { value, label }]);
        setNovaOrigem('');
    };
    const handleEditarOrigem = (value) => {
        const origem = origens.find(o => o.value === value);
        if (!origem) return;
        const novoLabel = prompt('Editar nome da origem:', origem.label);
        if (!novoLabel || novoLabel.trim() === '' || novoLabel.trim() === origem.label) return;
        setOrigens(prev => prev.map(o => o.value === value ? { ...o, label: novoLabel.trim() } : o));
    };
    const handleRemoverOrigem = (value) => {
        if (ORIGENS_PADRAO.some(o => o.value === value)) {
            if (!window.confirm('Esta é uma origem padrão. Tem certeza que deseja remover?')) return;
        }
        setOrigens(prev => prev.filter(o => o.value !== value));
    };
    const handleSalvarOrigens = async () => {
        try {
            setSavingOrigens(true);
            await configService.save('origens_lead', origens);
            toast.success('Origens do lead salvas!');
        } catch { toast.error('Erro ao salvar origens.'); }
        finally { setSavingOrigens(false); }
    };

    // Ações do Atendimento handlers
    const handleAdicionarAcao = () => {
        const label = novaAcao.trim();
        if (!label) return;
        const value = label.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
        if (acoes.some(a => a.value === value || a.label.toLowerCase() === label.toLowerCase())) {
            toast.error('Já existe uma ação com este nome.');
            return;
        }
        setAcoes(prev => [...prev, { value, label }]);
        setNovaAcao('');
    };
    const handleEditarAcao = (value) => {
        const acao = acoes.find(a => a.value === value);
        if (!acao) return;
        const novoLabel = prompt('Editar nome da ação:', acao.label);
        if (!novoLabel || novoLabel.trim() === '' || novoLabel.trim() === acao.label) return;
        setAcoes(prev => prev.map(a => a.value === value ? { ...a, label: novoLabel.trim() } : a));
    };
    const handleRemoverAcao = (value) => {
        if (ACOES_PADRAO.some(a => a.value === value)) {
            if (!window.confirm('Esta é uma ação padrão. Tem certeza que deseja remover?')) return;
        }
        setAcoes(prev => prev.filter(a => a.value !== value));
    };
    const handleResponsavelAcao = (value, responsavelId) => {
        setAcoes(prev => prev.map(a => a.value === value ? { ...a, responsavelPadraoId: responsavelId || null } : a));
    };
    const handleSalvarAcoes = async () => {
        try {
            setSavingAcoes(true);
            await configService.save('acoes_atendimento', acoes);
            toast.success('Ações do atendimento salvas!');
        } catch { toast.error('Erro ao salvar ações.'); }
        finally { setSavingAcoes(false); }
    };

    // Ações do Lead handlers
    const handleAdicionarAcaoLead = () => {
        const label = novaAcaoLead.trim();
        if (!label) return;
        const value = label.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
        if (acoesLead.some(a => a.value === value || a.label.toLowerCase() === label.toLowerCase())) {
            toast.error('Já existe uma ação com este nome.');
            return;
        }
        setAcoesLead(prev => [...prev, { value, label }]);
        setNovaAcaoLead('');
    };
    const handleEditarAcaoLead = (value) => {
        const acao = acoesLead.find(a => a.value === value);
        if (!acao) return;
        const novoLabel = prompt('Editar nome da ação:', acao.label);
        if (!novoLabel || novoLabel.trim() === '' || novoLabel.trim() === acao.label) return;
        setAcoesLead(prev => prev.map(a => a.value === value ? { ...a, label: novoLabel.trim() } : a));
    };
    const handleRemoverAcaoLead = (value) => {
        if (ACOES_PADRAO.some(a => a.value === value)) {
            if (!window.confirm('Esta é uma ação padrão. Tem certeza que deseja remover?')) return;
        }
        setAcoesLead(prev => prev.filter(a => a.value !== value));
    };
    const handleResponsavelAcaoLead = (value, responsavelId) => {
        setAcoesLead(prev => prev.map(a => a.value === value ? { ...a, responsavelPadraoId: responsavelId || null } : a));
    };
    const handleSalvarAcoesLead = async () => {
        try {
            setSavingAcoesLead(true);
            await configService.save('acoes_lead', acoesLead);
            toast.success('Ações do lead salvas!');
        } catch { toast.error('Erro ao salvar ações do lead.'); }
        finally { setSavingAcoesLead(false); }
    };

    // Tarefas Automáticas handlers
    const handleTarefaAutoChange = (tipo, campo, valor) => {
        setTarefasAuto(prev => ({
            ...prev,
            [tipo]: { ...prev[tipo], [campo]: valor }
        }));
    };
    const handleSalvarTarefasAuto = async () => {
        try {
            setSavingTarefasAuto(true);
            await configService.save('tarefas_automaticas', tarefasAuto);
            toast.success('Tarefas automáticas salvas!');
        } catch { toast.error('Erro ao salvar tarefas automáticas.'); }
        finally { setSavingTarefasAuto(false); }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Carregando configurações...</div>;

    return (
        <div className="container mx-auto px-4 py-8 space-y-8">
            <h1 className="text-2xl font-bold text-gray-800">Configurações do Sistema</h1>

            {/* ── Catálogo de Vendas ── */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gray-50">
                    <h2 className="text-lg font-semibold text-gray-700">Catálogo de Vendas</h2>
                    <p className="text-sm text-gray-500">Defina quais produtos aparecem para os vendedores.</p>
                </div>
                <div className="p-6">
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Categorias Visíveis</label>
                        <p className="text-xs text-gray-500 mb-4">
                            Selecione as categorias que devem aparecer no catálogo. Se nenhuma for selecionada, todas aparecerão (ou nenhuma, dependendo da regra).
                            Recomendamos selecionar explicitamente as desejadas.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto p-4 border rounded-md bg-gray-50">
                            {categorias.length === 0 ? (
                                <p className="text-sm text-gray-400 col-span-3 text-center">Nenhuma categoria encontrada nos produtos.</p>
                            ) : categorias.map(cat => (
                                <label key={cat} className="flex items-center space-x-3 p-2 bg-white rounded border border-gray-200 hover:bg-blue-50 cursor-pointer transition-colors">
                                    <input
                                        type="checkbox"
                                        className="h-5 w-5 text-primary focus:ring-primary border-gray-300 rounded"
                                        checked={selectedCategorias.includes(cat)}
                                        onChange={() => handleToggleCategoria(cat)}
                                    />
                                    <span className="text-sm text-gray-700 font-medium">{cat}</span>
                                </label>
                            ))}
                        </div>
                        <div className="mt-2 text-right text-xs text-gray-500">
                            {selectedCategorias.length} categorias selecionadas de {categorias.length}.
                        </div>
                    </div>

                    {message && (
                        <div className={`p-4 rounded-md mb-4 flex items-center ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            {message.type === 'success' ? <CheckCircle className="h-5 w-5 mr-2" /> : <AlertCircle className="h-5 w-5 mr-2" />}
                            {message.text}
                        </div>
                    )}
                    <div className="flex justify-end pt-4 border-t border-gray-100">
                        <button onClick={handleSave} disabled={saving}
                            className="flex items-center px-6 py-2 bg-primary text-white rounded-md font-medium shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
                            <Save className="h-5 w-5 mr-2" />
                            {saving ? 'Salvando...' : 'Salvar Alterações'}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Tipos de Atendimento ── */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
                            <ClipboardList className="h-5 w-5 text-blue-600" />
                            Tipos de Atendimento
                        </h2>
                        <p className="text-sm text-gray-500 mt-0.5">Defina os tipos disponíveis ao registrar um atendimento de rota.</p>
                    </div>
                </div>
                <div className="p-6 space-y-4">
                    {/* Lista de tipos */}
                    <div className="flex flex-wrap gap-2">
                        {tipos.map(t => {
                            const isPadrao = TIPOS_PADRAO.some(p => p.value === t.value);
                            return (
                                <div key={t.value} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold border ${isPadrao ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                                    {t.label}
                                    {isPadrao && <span className="text-[9px] text-blue-400 font-normal">(padrão)</span>}
                                    <button onClick={() => handleRemoverTipo(t.value)}
                                        className="ml-0.5 text-gray-400 hover:text-red-500 transition-colors">
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            );
                        })}
                        {tipos.length === 0 && (
                            <p className="text-sm text-gray-400 italic">Nenhum tipo cadastrado. Os padrões serão usados.</p>
                        )}
                    </div>

                    {/* Adicionar novo */}
                    <div className="flex gap-2 pt-2 border-t border-gray-100">
                        <input
                            type="text"
                            value={novoTipo}
                            onChange={e => setNovoTipo(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleAdicionarTipo(); }}
                            placeholder="Ex: Degustação, Reunião, Captação..."
                            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none"
                        />
                        <button onClick={handleAdicionarTipo} disabled={!novoTipo.trim()}
                            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                            <Plus className="h-4 w-4" /> Adicionar
                        </button>
                    </div>

                    <div className="flex justify-end">
                        <button onClick={handleSalvarTipos} disabled={savingTipos}
                            className="flex items-center gap-1.5 px-5 py-2 bg-primary text-white rounded-md font-medium shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm">
                            <Save className="h-4 w-4" />
                            {savingTipos ? 'Salvando...' : 'Salvar Tipos'}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Origens do Lead ── */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gray-50">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
                            <MapPin className="h-5 w-5 text-teal-600" />
                            Origens do Lead
                        </h2>
                        <p className="text-sm text-gray-500 mt-0.5">De onde vieram os leads captados. Usado no cadastro de novos leads.</p>
                    </div>
                </div>
                <div className="p-6 space-y-4">
                    <div className="flex flex-wrap gap-2">
                        {origens.map(o => {
                            const isPadrao = ORIGENS_PADRAO.some(p => p.value === o.value);
                            return (
                                <div key={o.value} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold border ${isPadrao ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                                    <button onClick={() => handleEditarOrigem(o.value)} className="hover:underline" title="Clique para editar">
                                        {o.label}
                                    </button>
                                    {isPadrao && <span className="text-[9px] text-teal-400 font-normal">(padrão)</span>}
                                    <button onClick={() => handleRemoverOrigem(o.value)} className="ml-0.5 text-gray-400 hover:text-red-500 transition-colors">
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            );
                        })}
                        {origens.length === 0 && <p className="text-sm text-gray-400 italic">Nenhuma origem cadastrada.</p>}
                    </div>
                    <div className="flex gap-2 pt-2 border-t border-gray-100">
                        <input type="text" value={novaOrigem} onChange={e => setNovaOrigem(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleAdicionarOrigem(); }}
                            placeholder="Ex: Rede social, Feira, Parceiro..."
                            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-400 focus:border-transparent outline-none" />
                        <button onClick={handleAdicionarOrigem} disabled={!novaOrigem.trim()}
                            className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 transition-colors">
                            <Plus className="h-4 w-4" /> Adicionar
                        </button>
                    </div>
                    <div className="flex justify-end">
                        <button onClick={handleSalvarOrigens} disabled={savingOrigens}
                            className="flex items-center gap-1.5 px-5 py-2 bg-primary text-white rounded-md font-medium shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm">
                            <Save className="h-4 w-4" />
                            {savingOrigens ? 'Salvando...' : 'Salvar Origens'}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Ações do Atendimento ── */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gray-50">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
                            <Zap className="h-5 w-5 text-orange-600" />
                            Ações do Atendimento
                        </h2>
                        <p className="text-sm text-gray-500 mt-0.5">Próximos passos/status para atendimentos de clientes. Defina o responsável padrão de cada ação.</p>
                    </div>
                </div>
                <div className="p-6 space-y-4">
                    <div className="space-y-2">
                        {acoes.map(a => {
                            const isPadrao = ACOES_PADRAO.some(p => p.value === a.value);
                            return (
                                <div key={a.value} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${isPadrao ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-200'}`}>
                                    <button onClick={() => handleEditarAcao(a.value)} className="font-semibold text-[13px] text-gray-800 hover:underline flex-shrink-0" title="Clique para editar">
                                        {a.label}
                                    </button>
                                    {isPadrao && <span className="text-[9px] text-orange-400 font-normal">(padrão)</span>}
                                    <div className="flex-1 flex items-center gap-1.5 ml-auto">
                                        <UserCheck className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                                        <select
                                            value={a.responsavelPadraoId || ''}
                                            onChange={e => handleResponsavelAcao(a.value, e.target.value)}
                                            className="text-[12px] border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 max-w-[180px]"
                                        >
                                            <option value="">Vendedor do lead</option>
                                            {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                                        </select>
                                    </div>
                                    <button onClick={() => handleRemoverAcao(a.value)} className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            );
                        })}
                        {acoes.length === 0 && <p className="text-sm text-gray-400 italic">Nenhuma ação cadastrada.</p>}
                    </div>
                    <div className="flex gap-2 pt-2 border-t border-gray-100">
                        <input type="text" value={novaAcao} onChange={e => setNovaAcao(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleAdicionarAcao(); }}
                            placeholder="Ex: Enviar proposta, Agendar reunião..."
                            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none" />
                        <button onClick={handleAdicionarAcao} disabled={!novaAcao.trim()}
                            className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700 disabled:opacity-50 transition-colors">
                            <Plus className="h-4 w-4" /> Adicionar
                        </button>
                    </div>
                    <div className="flex justify-end">
                        <button onClick={handleSalvarAcoes} disabled={savingAcoes}
                            className="flex items-center gap-1.5 px-5 py-2 bg-primary text-white rounded-md font-medium shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm">
                            <Save className="h-4 w-4" />
                            {savingAcoes ? 'Salvando...' : 'Salvar Ações'}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Ações do Lead ── */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gray-50">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
                            <Target className="h-5 w-5 text-purple-600" />
                            Ações do Lead
                        </h2>
                        <p className="text-sm text-gray-500 mt-0.5">Próximos passos/status exclusivos para gestão de leads. Defina o responsável padrão de cada ação.</p>
                    </div>
                </div>
                <div className="p-6 space-y-4">
                    <div className="space-y-2">
                        {acoesLead.map(a => {
                            const isPadrao = ACOES_PADRAO.some(p => p.value === a.value);
                            return (
                                <div key={a.value} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${isPadrao ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200'}`}>
                                    <button onClick={() => handleEditarAcaoLead(a.value)} className="font-semibold text-[13px] text-gray-800 hover:underline flex-shrink-0" title="Clique para editar">
                                        {a.label}
                                    </button>
                                    {isPadrao && <span className="text-[9px] text-purple-400 font-normal">(padrão)</span>}
                                    <div className="flex-1 flex items-center gap-1.5 ml-auto">
                                        <UserCheck className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                                        <select
                                            value={a.responsavelPadraoId || ''}
                                            onChange={e => handleResponsavelAcaoLead(a.value, e.target.value)}
                                            className="text-[12px] border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 max-w-[180px]"
                                        >
                                            <option value="">Vendedor do lead</option>
                                            {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                                        </select>
                                    </div>
                                    <button onClick={() => handleRemoverAcaoLead(a.value)} className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            );
                        })}
                        {acoesLead.length === 0 && <p className="text-sm text-gray-400 italic">Nenhuma ação cadastrada.</p>}
                    </div>
                    <div className="flex gap-2 pt-2 border-t border-gray-100">
                        <input type="text" value={novaAcaoLead} onChange={e => setNovaAcaoLead(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleAdicionarAcaoLead(); }}
                            placeholder="Ex: Agendar visita, Enviar catálogo..."
                            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-400 focus:border-transparent outline-none" />
                        <button onClick={handleAdicionarAcaoLead} disabled={!novaAcaoLead.trim()}
                            className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors">
                            <Plus className="h-4 w-4" /> Adicionar
                        </button>
                    </div>
                    <div className="flex justify-end">
                        <button onClick={handleSalvarAcoesLead} disabled={savingAcoesLead}
                            className="flex items-center gap-1.5 px-5 py-2 bg-primary text-white rounded-md font-medium shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm">
                            <Save className="h-4 w-4" />
                            {savingAcoesLead ? 'Salvando...' : 'Salvar Ações do Lead'}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Tarefas Automáticas ── */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-emerald-50">
                    <h2 className="text-lg font-semibold text-emerald-700 flex items-center gap-2">
                        <Zap className="h-5 w-5" />
                        Tarefas Automáticas
                    </h2>
                    <p className="text-sm text-gray-500 mt-0.5">Configure tarefas criadas automaticamente pelo sistema.</p>
                </div>
                <div className="p-6 space-y-6">
                    {/* Pós-Venda */}
                    <div className="border border-gray-100 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-[14px] font-bold text-gray-800">Pós-Venda</h3>
                                <p className="text-[12px] text-gray-500">Cria tarefa quando um lead é convertido em cliente.</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={tarefasAuto.pos_venda.ativo}
                                    onChange={e => handleTarefaAutoChange('pos_venda', 'ativo', e.target.checked)}
                                    className="sr-only peer" />
                                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                            </label>
                        </div>
                        {tarefasAuto.pos_venda.ativo && (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">Ação</label>
                                    <input type="text" value={tarefasAuto.pos_venda.acao_label}
                                        onChange={e => handleTarefaAutoChange('pos_venda', 'acao_label', e.target.value)}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px]" />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">Dias após conversão</label>
                                    <input type="number" min={1} max={90} value={tarefasAuto.pos_venda.dias_apos}
                                        onChange={e => handleTarefaAutoChange('pos_venda', 'dias_apos', parseInt(e.target.value) || 7)}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px]" />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">Responsável padrão</label>
                                    <select value={tarefasAuto.pos_venda.responsavel_id || ''}
                                        onChange={e => handleTarefaAutoChange('pos_venda', 'responsavel_id', e.target.value || '')}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px]">
                                        <option value="">Vendedor do lead</option>
                                        {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Reativação */}
                    <div className="border border-gray-100 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-[14px] font-bold text-gray-800">Reativação de Clientes</h3>
                                <p className="text-[12px] text-gray-500">Cria tarefa quando cliente fica atrasado ou crítico (Inteligência Comercial).</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={tarefasAuto.reativacao.ativo}
                                    onChange={e => handleTarefaAutoChange('reativacao', 'ativo', e.target.checked)}
                                    className="sr-only peer" />
                                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                            </label>
                        </div>
                        {tarefasAuto.reativacao.ativo && (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">Ação</label>
                                    <input type="text" value={tarefasAuto.reativacao.acao_label}
                                        onChange={e => handleTarefaAutoChange('reativacao', 'acao_label', e.target.value)}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px]" />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">Dias para vencimento</label>
                                    <input type="number" min={1} max={30} value={tarefasAuto.reativacao.dias_vencimento}
                                        onChange={e => handleTarefaAutoChange('reativacao', 'dias_vencimento', parseInt(e.target.value) || 3)}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px]" />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">Responsável padrão</label>
                                    <select value={tarefasAuto.reativacao.responsavel_id || ''}
                                        onChange={e => handleTarefaAutoChange('reativacao', 'responsavel_id', e.target.value || '')}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px]">
                                        <option value="">Vendedor do cliente</option>
                                        {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end">
                        <button onClick={handleSalvarTarefasAuto} disabled={savingTarefasAuto}
                            className="flex items-center gap-1.5 px-5 py-2 bg-primary text-white rounded-md font-medium shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm">
                            <Save className="h-4 w-4" />
                            {savingTarefasAuto ? 'Salvando...' : 'Salvar Tarefas Automáticas'}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Rotas Ativas (Roteirização) ── */}
            <RotasAtivasPreview />

            {/* ── Reset de Dados ── */}
            {podeResetar && (
                <div className="bg-white rounded-lg shadow-sm border border-red-200 overflow-hidden">
                    <div className="p-6 border-b border-red-100 bg-red-50">
                        <h2 className="text-lg font-semibold text-red-700 flex items-center gap-2">
                            <Trash2 className="h-5 w-5" />
                            Reset de Dados
                        </h2>
                        <p className="text-sm text-red-500 mt-0.5">Limpe dados transacionais por categoria. Ações irreversíveis.</p>
                    </div>
                    <div className="p-6 space-y-3">
                        {resetGrupos.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-4">Nenhum grupo de reset disponível.</p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {resetGrupos.map(grupo => (
                                    <button
                                        key={grupo.id}
                                        onClick={() => handleResetGrupo(grupo.id, grupo.label)}
                                        disabled={resettingGroup !== null}
                                        className="flex items-center gap-2 px-4 py-3 border border-red-200 rounded-lg text-left hover:bg-red-50 hover:border-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {resettingGroup === grupo.id ? (
                                            <Loader2 className="h-4 w-4 text-red-500 animate-spin flex-shrink-0" />
                                        ) : (
                                            <Trash2 className="h-4 w-4 text-red-400 flex-shrink-0" />
                                        )}
                                        <span className="text-sm font-medium text-gray-700">{grupo.label}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="pt-4 border-t border-red-100">
                            <button
                                onClick={handleResetTotal}
                                disabled={resettingGroup !== null}
                                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg font-semibold text-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {resettingGroup === '__total__' ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Trash2 className="h-4 w-4" />
                                )}
                                Limpar TODOS os Dados Transacionais
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Log de Auditoria ── */}
            {isAdmin && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-gray-50">
                        <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
                            <ScrollText className="h-5 w-5 text-indigo-600" />
                            Log de Auditoria
                        </h2>
                        <p className="text-sm text-gray-500 mt-0.5">Registro de ações administrativas no sistema (reversões de caixa, etc).</p>
                    </div>
                    <div className="p-6">
                        {auditLogs.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-4">Nenhuma ação registrada.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-200 text-left text-gray-500">
                                            <th className="py-2 pr-4 font-medium">Data/Hora</th>
                                            <th className="py-2 pr-4 font-medium">Ação</th>
                                            <th className="py-2 pr-4 font-medium">Caixa</th>
                                            <th className="py-2 font-medium">Executado por</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {auditLogs.map(log => {
                                            const acaoLabel = {
                                                REVERTER_CONFERENCIA: 'Reverter Conferência',
                                                REABRIR_CAIXA: 'Reabrir Caixa'
                                            }[log.acao] || log.acao;
                                            const acaoColor = log.acao === 'REABRIR_CAIXA'
                                                ? 'bg-amber-100 text-amber-800'
                                                : 'bg-orange-100 text-orange-800';
                                            return (
                                                <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
                                                    <td className="py-2.5 pr-4 text-gray-600 whitespace-nowrap">
                                                        {new Date(log.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                                                    </td>
                                                    <td className="py-2.5 pr-4">
                                                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${acaoColor}`}>
                                                            {acaoLabel}
                                                        </span>
                                                    </td>
                                                    <td className="py-2.5 pr-4 text-gray-700">
                                                        {log.detalhes?.vendedor || '—'} — {log.detalhes?.data || ''}
                                                    </td>
                                                    <td className="py-2.5 text-gray-600">{log.usuarioNome}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Configuracoes;
