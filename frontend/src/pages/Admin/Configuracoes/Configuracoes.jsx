import React, { useEffect, useState } from 'react';
import configService from '../../../services/configService';
import { Save, AlertCircle, CheckCircle, Plus, X, ClipboardList, Trash2, Loader2, ScrollText, MapPin, Zap, Target, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';
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

// ── Componente reutilizável: Card de ação expandível ──
const AcaoCard = ({ acao, onAtualizar, onRemover, vendedores, isPadrao }) => {
    const [expandido, setExpandido] = useState(false);

    const Toggle = ({ label, campo, valor }) => (
        <label className="flex items-center justify-between py-1.5">
            <span className="text-[13px] text-gray-700">{label}</span>
            <button
                type="button"
                onClick={() => onAtualizar(acao.value, campo, !valor)}
                className={`relative w-9 h-5 rounded-full transition-colors ${valor ? 'bg-blue-600' : 'bg-gray-300'}`}
            >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${valor ? 'translate-x-4' : ''}`} />
            </button>
        </label>
    );

    return (
        <div className={`border rounded-lg overflow-hidden transition-colors ${acao.ativo === false ? 'opacity-60 border-gray-200 bg-gray-50' : 'border-gray-200 bg-white'}`}>
            {/* Header do card */}
            <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-50" onClick={() => setExpandido(!expandido)}>
                <span
                    className="w-4 h-4 rounded-full border-2 flex-shrink-0"
                    style={{ backgroundColor: acao.cor || '#6b7280', borderColor: acao.cor || '#6b7280' }}
                />
                <span className="text-[14px] font-semibold text-gray-800 flex-1">{acao.label}</span>
                {isPadrao && <span className="text-[9px] text-gray-400">(padrão)</span>}
                {acao.ativo === false && <EyeOff className="h-3.5 w-3.5 text-gray-400" />}
                {expandido ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </div>

            {/* Painel expandido */}
            {expandido && (
                <div className="px-3 pb-3 border-t border-gray-100 space-y-2 pt-2">
                    {/* Nome editável */}
                    <div>
                        <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Nome</label>
                        <input
                            type="text"
                            value={acao.label}
                            onChange={e => onAtualizar(acao.value, 'label', e.target.value)}
                            className="block w-full border border-gray-300 rounded px-2.5 py-1.5 text-[13px] mt-0.5 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    {/* Cor */}
                    <div className="flex items-center gap-2">
                        <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Cor</label>
                        <input
                            type="color"
                            value={acao.cor || '#6b7280'}
                            onChange={e => onAtualizar(acao.value, 'cor', e.target.value)}
                            className="w-7 h-7 rounded border border-gray-300 cursor-pointer p-0"
                        />
                    </div>

                    {/* Toggles */}
                    <div className="space-y-0.5 border-t border-gray-100 pt-2">
                        <Toggle label="Ativo" campo="ativo" valor={acao.ativo !== false} />
                        <Toggle label="Obriga observação" campo="obrigaObservacao" valor={!!acao.obrigaObservacao} />
                        <Toggle label="Permite data de retorno" campo="permiteDataRetorno" valor={!!acao.permiteDataRetorno} />
                        {acao.permiteDataRetorno && (
                            <Toggle label="Obriga data de retorno" campo="obrigaDataRetorno" valor={!!acao.obrigaDataRetorno} />
                        )}
                        <Toggle label="Permite assunto do retorno" campo="permiteAssuntoRetorno" valor={!!acao.permiteAssuntoRetorno} />
                        <Toggle label="Transfere atendimento" campo="transfereAtendimento" valor={!!acao.transfereAtendimento} />
                        {acao.transfereAtendimento && (
                            <div className="pl-2 pb-1 space-y-1.5">
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => { onAtualizar(acao.value, 'modoTransferencia', 'fixo'); }}
                                        className={`text-[11px] px-2 py-1 rounded border font-semibold ${(acao.modoTransferencia || 'fixo') === 'fixo' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}
                                    >
                                        Definir fixo
                                    </button>
                                    <button
                                        onClick={() => { onAtualizar(acao.value, 'modoTransferencia', 'escolhe'); onAtualizar(acao.value, 'responsavelTransferenciaId', null); }}
                                        className={`text-[11px] px-2 py-1 rounded border font-semibold ${acao.modoTransferencia === 'escolhe' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}
                                    >
                                        Usuário escolhe
                                    </button>
                                </div>
                                {(acao.modoTransferencia || 'fixo') === 'fixo' && (
                                    <div>
                                        <label className="text-[11px] font-medium text-gray-500">Responsável fixo</label>
                                        <select
                                            value={acao.responsavelTransferenciaId || ''}
                                            onChange={e => onAtualizar(acao.value, 'responsavelTransferenciaId', e.target.value || null)}
                                            className="block w-full border border-gray-300 rounded px-2 py-1.5 text-[13px] mt-0.5 focus:ring-1 focus:ring-blue-500"
                                        >
                                            <option value="">Selecione...</option>
                                            {vendedores.map(v => (
                                                <option key={v.id} value={v.id}>{v.nome}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                {acao.modoTransferencia === 'escolhe' && (
                                    <p className="text-[11px] text-gray-400 italic">O vendedor vai escolher para quem transferir na hora do atendimento.</p>
                                )}
                            </div>
                        )}
                        <Toggle label="Abre pedido de amostra" campo="abrePedidoAmostra" valor={!!acao.abrePedidoAmostra} />
                        <Toggle label="Cria alerta visual" campo="criaAlertaVisual" valor={!!acao.criaAlertaVisual} />
                    </div>

                    {/* Remover */}
                    <div className="flex justify-end pt-2 border-t border-gray-100">
                        <button
                            onClick={() => onRemover(acao.value)}
                            className="text-[12px] text-red-500 hover:text-red-700 font-medium flex items-center gap-1"
                        >
                            <X className="h-3.5 w-3.5" /> Remover ação
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Seção completa de ações (reutilizada para atendimento e lead) ──
const AcoesConfigSection = ({ titulo, subtitulo, icon, cor, acoes, novaAcao, setNovaAcao, onAdicionar, onRemover, onAtualizar, onSalvar, saving, vendedores, acoesPadrao }) => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
                {icon}
                {titulo}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">{subtitulo}</p>
        </div>
        <div className="p-4 space-y-3">
            {acoes.length === 0 && <p className="text-sm text-gray-400 italic text-center py-4">Nenhuma ação cadastrada.</p>}
            {acoes.map(a => (
                <AcaoCard
                    key={a.value}
                    acao={a}
                    onAtualizar={onAtualizar}
                    onRemover={onRemover}
                    vendedores={vendedores}
                    isPadrao={acoesPadrao.some(p => p.value === a.value)}
                />
            ))}

            <div className={`flex gap-2 pt-2 border-t border-gray-100`}>
                <input
                    type="text"
                    value={novaAcao}
                    onChange={e => setNovaAcao(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') onAdicionar(); }}
                    placeholder="Nome da nova ação..."
                    className={`flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-${cor}-400 focus:border-transparent outline-none`}
                />
                <button onClick={onAdicionar} disabled={!novaAcao?.trim()}
                    className={`flex items-center gap-1.5 px-4 py-2 bg-${cor}-600 text-white rounded-lg text-sm font-semibold hover:bg-${cor}-700 disabled:opacity-50 transition-colors`}>
                    <Plus className="h-4 w-4" /> Adicionar
                </button>
            </div>

            <div className="flex justify-end">
                <button onClick={onSalvar} disabled={saving}
                    className="flex items-center gap-1.5 px-5 py-2 bg-primary text-white rounded-md font-medium shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm">
                    <Save className="h-4 w-4" />
                    {saving ? 'Salvando...' : `Salvar ${titulo}`}
                </button>
            </div>
        </div>
    </div>
);

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

    // Vendedores (para dropdown de transferência)
    const [vendedores, setVendedores] = useState([]);

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
            const [cats, currentConfig, tiposConfig, origensConfig, acoesConfig, acoesLeadConfig, grupos, logs, vendedoresData] = await Promise.all([
                configService.getCategorias(),
                configService.get('categorias_vendas'),
                configService.get('tipos_atendimento').catch(() => null),
                configService.get('origens_lead').catch(() => null),
                configService.get('acoes_atendimento').catch(() => null),
                configService.get('acoes_lead').catch(() => null),
                podeResetar ? api.get('/admin/reset-grupos').then(r => r.data).catch(() => []) : Promise.resolve(null),
                isAdmin ? caixaService.getAuditLogs().catch(() => []) : Promise.resolve(null),
                api.get('/vendedores').then(r => r.data).catch(() => [])
            ]);
            setCategorias(cats);
            setSelectedCategorias(Array.isArray(currentConfig) ? currentConfig : []);
            setTipos(Array.isArray(tiposConfig) && tiposConfig.length > 0 ? tiposConfig : TIPOS_PADRAO);
            setOrigens(Array.isArray(origensConfig) && origensConfig.length > 0 ? origensConfig : ORIGENS_PADRAO);
            setAcoes(Array.isArray(acoesConfig) && acoesConfig.length > 0 ? acoesConfig : ACOES_PADRAO);
            setAcoesLead(Array.isArray(acoesLeadConfig) && acoesLeadConfig.length > 0 ? acoesLeadConfig : ACOES_PADRAO);
            if (grupos) setResetGrupos(grupos);
            if (logs) setAuditLogs(logs);
            const vList = Array.isArray(vendedoresData) ? vendedoresData : vendedoresData?.vendedores || [];
            setVendedores(vList.filter(v => v.ativo !== false));
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

    // ── Handlers genéricos para ações (atendimento e lead) ──
    const handleAdicionarAcao = () => {
        const label = novaAcao.trim();
        if (!label) return;
        const value = label.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
        if (acoes.some(a => a.value === value || a.label.toLowerCase() === label.toLowerCase())) {
            toast.error('Já existe uma ação com este nome.');
            return;
        }
        setAcoes(prev => [...prev, { value, label, ativo: true, cor: '#6b7280', obrigaObservacao: false, permiteDataRetorno: false, obrigaDataRetorno: false, permiteAssuntoRetorno: false, transfereAtendimento: false, responsavelTransferenciaId: null, abrePedidoAmostra: false, criaAlertaVisual: false }]);
        setNovaAcao('');
    };
    const handleRemoverAcao = (value) => {
        if (ACOES_PADRAO.some(a => a.value === value)) {
            if (!window.confirm('Esta é uma ação padrão. Tem certeza que deseja remover?')) return;
        }
        setAcoes(prev => prev.filter(a => a.value !== value));
    };
    const handleAtualizarAcao = (value, campo, novoValor) => {
        setAcoes(prev => prev.map(a => a.value === value ? { ...a, [campo]: novoValor } : a));
    };
    const handleSalvarAcoes = async () => {
        try {
            setSavingAcoes(true);
            await configService.save('acoes_atendimento', acoes);
            toast.success('Ações do atendimento salvas!');
        } catch { toast.error('Erro ao salvar ações.'); }
        finally { setSavingAcoes(false); }
    };

    const handleAdicionarAcaoLead = () => {
        const label = novaAcaoLead.trim();
        if (!label) return;
        const value = label.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
        if (acoesLead.some(a => a.value === value || a.label.toLowerCase() === label.toLowerCase())) {
            toast.error('Já existe uma ação com este nome.');
            return;
        }
        setAcoesLead(prev => [...prev, { value, label, ativo: true, cor: '#6b7280', obrigaObservacao: false, permiteDataRetorno: false, obrigaDataRetorno: false, permiteAssuntoRetorno: false, transfereAtendimento: false, responsavelTransferenciaId: null, abrePedidoAmostra: false, criaAlertaVisual: false }]);
        setNovaAcaoLead('');
    };
    const handleRemoverAcaoLead = (value) => {
        if (ACOES_PADRAO.some(a => a.value === value)) {
            if (!window.confirm('Esta é uma ação padrão. Tem certeza que deseja remover?')) return;
        }
        setAcoesLead(prev => prev.filter(a => a.value !== value));
    };
    const handleAtualizarAcaoLead = (value, campo, novoValor) => {
        setAcoesLead(prev => prev.map(a => a.value === value ? { ...a, [campo]: novoValor } : a));
    };
    const handleSalvarAcoesLead = async () => {
        try {
            setSavingAcoesLead(true);
            await configService.save('acoes_lead', acoesLead);
            toast.success('Ações do lead salvas!');
        } catch { toast.error('Erro ao salvar ações do lead.'); }
        finally { setSavingAcoesLead(false); }
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
            <AcoesConfigSection
                titulo="Ações do Atendimento"
                subtitulo="Próximos passos/status para atendimentos de clientes."
                icon={<Zap className="h-5 w-5 text-orange-600" />}
                cor="orange"
                acoes={acoes}
                novaAcao={novaAcao}
                setNovaAcao={setNovaAcao}
                onAdicionar={handleAdicionarAcao}
                onRemover={handleRemoverAcao}
                onAtualizar={handleAtualizarAcao}
                onSalvar={handleSalvarAcoes}
                saving={savingAcoes}
                vendedores={vendedores}
                acoesPadrao={ACOES_PADRAO}
            />

            {/* ── Ações do Lead ── */}
            <AcoesConfigSection
                titulo="Ações do Lead"
                subtitulo="Próximos passos/status exclusivos para gestão de leads."
                icon={<Target className="h-5 w-5 text-purple-600" />}
                cor="purple"
                acoes={acoesLead}
                novaAcao={novaAcaoLead}
                setNovaAcao={setNovaAcaoLead}
                onAdicionar={handleAdicionarAcaoLead}
                onRemover={handleRemoverAcaoLead}
                onAtualizar={handleAtualizarAcaoLead}
                onSalvar={handleSalvarAcoesLead}
                saving={savingAcoesLead}
                vendedores={vendedores}
                acoesPadrao={ACOES_PADRAO}
            />

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
