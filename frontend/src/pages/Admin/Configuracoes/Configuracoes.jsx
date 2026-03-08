import React, { useEffect, useState } from 'react';
import configService from '../../../services/configService';
import { Save, AlertCircle, CheckCircle, Truck, Plus, X, ClipboardList } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import RotasAtivasPreview from './RotasAtivasPreview';

const TIPOS_PADRAO = [
    { value: 'VISITA', label: 'Visita Presencial' },
    { value: 'AMOSTRA', label: 'Amostra' },
    { value: 'LIGACAO', label: 'Ligação' },
    { value: 'WHATSAPP', label: 'WhatsApp' },
    { value: 'OUTROS', label: 'Outros' },
];

const Configuracoes = () => {
    const [categorias, setCategorias] = useState([]);
    const [selectedCategorias, setSelectedCategorias] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);

    // Tipos de Atendimento
    const [tipos, setTipos] = useState([]);
    const [novoTipo, setNovoTipo] = useState('');
    const [savingTipos, setSavingTipos] = useState(false);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [cats, currentConfig, tiposConfig] = await Promise.all([
                configService.getCategorias(),
                configService.get('categorias_vendas'),
                configService.get('tipos_atendimento').catch(() => null)
            ]);
            setCategorias(cats);
            setSelectedCategorias(Array.isArray(currentConfig) ? currentConfig : []);
            setTipos(Array.isArray(tiposConfig) && tiposConfig.length > 0 ? tiposConfig : TIPOS_PADRAO);
        } catch (error) {
            console.error('Erro ao carregar configurações:', error);
            setMessage({ type: 'error', text: 'Erro ao carregar dados.' });
        } finally {
            setLoading(false);
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

            {/* ── Logística e Expedição ── */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-700 flex items-center">
                            <Truck className="h-5 w-5 mr-2 text-sky-600" />
                            Logística e Expedição
                        </h2>
                        <p className="text-sm text-gray-500">Regras e exceções de controle para os caminhões.</p>
                    </div>
                </div>
                <div className="p-6">
                    <div className="mb-4">
                        <h3 className="text-md font-medium text-gray-800">Meios de Pagamento da Viagem</h3>
                        <p className="text-xs text-gray-500 mt-1 mb-4">
                            Crie parâmetros de baixa como "Caixa Devedor (Motorista)", "Responsabilidade Escritório", Pix na rua, etc. Isso moldará o checkout do Aplicativo.
                        </p>
                        <Link to="/config/pagamentos-entrega" className="inline-flex items-center px-4 py-2 bg-sky-50 text-sky-700 border border-sky-200 rounded-md shadow-sm text-sm font-medium hover:bg-sky-100 transition-colors">
                            Configurar Pagamentos da Entrega
                        </Link>
                    </div>
                </div>
            </div>

            {/* ── Rotas Ativas (Roteirização) ── */}
            <RotasAtivasPreview />
        </div>
    );
};

export default Configuracoes;
