import React, { useState, useEffect, useRef } from 'react';
import {
    X, Car, FileText, Shield, Wrench, Fuel, Users, MessageSquare,
    AlertTriangle, CheckCircle, BellRing, ChevronRight, Edit3, Save, TrendingUp, Plus, Loader, Trash2, Upload
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import api, { API_URL } from '../../services/api';
import vendedorService from '../../services/vendedorService';

const TABS = [
    { id: 'resumo', label: 'Resumo', icon: Car },
    { id: 'documentos', label: 'Documentos', icon: FileText },
    { id: 'manutencao', label: 'Manutenção', icon: Wrench },
    { id: 'consumo', label: 'Consumo', icon: Fuel },
    { id: 'historico', label: 'Motoristas', icon: Users },
    { id: 'obs', label: 'Obs.', icon: MessageSquare },
];

const TIPOS_MANUTENCAO = [
    { value: 'REVISAO', label: 'Revisão' },
    { value: 'RODIZIO_PNEUS', label: 'Rodízio de Pneus' },
    { value: 'TROCA_OLEO', label: 'Troca de Óleo' },
    { value: 'TROCA_FILTRO', label: 'Troca de Filtro' },
    { value: 'OUTRO', label: 'Outro' }
];

const formatDate = (d) => {
    if (!d) return '—';
    const parts = String(d).split('T')[0].split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return d;
};

const diasParaVencer = (dateStr) => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
};

const VeiculoFicha = ({ veiculoId, onClose, onUpdate, readOnly = false, allowedTabs = null }) => {
    const [activeTab, setActiveTab] = useState('resumo');
    const [ficha, setFicha] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editando, setEditando] = useState(false);
    const [form, setForm] = useState({});
    const [saving, setSaving] = useState(false);
    const [novoAlerta, setNovoAlerta] = useState({ tipo: '', descricao: '', kmAlerta: '', dataAlerta: '' });
    const [savingAlerta, setSavingAlerta] = useState(false);

    // Uso manual de veículo
    const [showUsoForm, setShowUsoForm] = useState(false);
    const [vendedores, setVendedores] = useState([]);
    const [usoForm, setUsoForm] = useState({ motoristaId: '', motoristaNome: '', dataReferencia: '', kmInicial: '', kmFinal: '', obs: '' });
    const [savingUso, setSavingUso] = useState(false);
    const [kmConflito, setKmConflito] = useState(null);

    // Abastecimento manual
    const [showAbastForm, setShowAbastForm] = useState(false);
    const [abastForm, setAbastForm] = useState({ dataReferencia: '', litros: '', valor: '', kmNoAbastecimento: '', descricao: '' });
    const [savingAbast, setSavingAbast] = useState(false);

    // Edição inline
    const [editingAbastId, setEditingAbastId] = useState(null);
    const [editAbastForm, setEditAbastForm] = useState({});
    const [editingUsoId, setEditingUsoId] = useState(null);
    const [editUsoForm, setEditUsoForm] = useState({});

    // Upload de arquivos
    const [uploadingDoc, setUploadingDoc] = useState(false);
    const [uploadingApolice, setUploadingApolice] = useState(false);
    const docInputRef = useRef(null);
    const apoliceInputRef = useRef(null);

    const carregarFicha = async () => {
        try {
            setLoading(true);
            const res = await api.get(`/veiculos/${veiculoId}/ficha`);
            setFicha(res.data);
            setForm({
                seguroVencimento: res.data.seguroVencimento ? res.data.seguroVencimento.split('T')[0] : '',
                seguroApolice: res.data.seguroApolice || '',
                seguroSeguradora: res.data.seguroSeguradora || '',
                capacidadeTanque: res.data.capacidadeTanque || '',
                kmMedioSugerido: res.data.kmMedioSugerido || '',
                observacoes: res.data.observacoes || '',
                documentoUrl: res.data.documentoUrl || '',
            });
        } catch (e) {
            toast.error('Erro ao carregar ficha do veículo.');
            onClose();
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { if (veiculoId) carregarFicha(); }, [veiculoId]);

    const salvarFicha = async () => {
        try {
            setSaving(true);
            await api.put(`/veiculos/${veiculoId}`, form);
            toast.success('Ficha atualizada!');
            setEditando(false);
            carregarFicha();
            if (onUpdate) onUpdate();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao salvar.');
        } finally {
            setSaving(false);
        }
    };

    const handleCriarAlerta = async (e) => {
        e.preventDefault();
        if (!novoAlerta.tipo) return;
        try {
            setSavingAlerta(true);
            await api.post(`/veiculos/${veiculoId}/manutencao`, {
                tipo: novoAlerta.tipo,
                descricao: novoAlerta.descricao || null,
                kmAlerta: novoAlerta.kmAlerta ? parseInt(novoAlerta.kmAlerta) : null,
                dataAlerta: novoAlerta.dataAlerta || null
            });
            toast.success('Alerta criado!');
            setNovoAlerta({ tipo: '', descricao: '', kmAlerta: '', dataAlerta: '' });
            carregarFicha();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao criar alerta.');
        } finally {
            setSavingAlerta(false);
        }
    };

    const handleConcluirAlerta = async (alertaId) => {
        try {
            await api.patch(`/veiculos/manutencao/${alertaId}/concluir`);
            toast.success('Alerta concluído!');
            carregarFicha();
        } catch { toast.error('Erro ao concluir alerta.'); }
    };

    // Carrega lista de vendedores para o select de motorista
    useEffect(() => {
        if (!readOnly) {
            vendedorService.listar().then(setVendedores).catch(() => {});
        }
    }, [readOnly]);

    useEffect(() => {
        if (readOnly && editando) setEditando(false);
    }, [readOnly, editando]);

    // Validação de KM overlap em tempo real
    useEffect(() => {
        const { kmInicial, kmFinal } = usoForm;
        if (!kmInicial || !kmFinal || parseInt(kmFinal) <= parseInt(kmInicial)) {
            setKmConflito(null);
            return;
        }
        const timer = setTimeout(async () => {
            try {
                const res = await api.post(`/veiculos/${veiculoId}/validar-km`, {
                    kmInicial: parseInt(kmInicial),
                    kmFinal: parseInt(kmFinal)
                });
                setKmConflito(res.data.valido ? null : res.data.mensagem);
            } catch {
                setKmConflito(null);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [usoForm.kmInicial, usoForm.kmFinal, veiculoId]);

    const handleRegistrarUso = async (e) => {
        e.preventDefault();
        if (kmConflito) {
            toast.error('Corrija o conflito de KM antes de salvar.');
            return;
        }
        try {
            setSavingUso(true);
            await api.post(`/veiculos/${veiculoId}/uso-manual`, {
                motoristaId: usoForm.motoristaId || null,
                motoristaNome: usoForm.motoristaNome || null,
                dataReferencia: usoForm.dataReferencia,
                kmInicial: parseInt(usoForm.kmInicial),
                kmFinal: parseInt(usoForm.kmFinal),
                obs: usoForm.obs || null
            });
            toast.success('Uso registrado!');
            setUsoForm({ motoristaId: '', motoristaNome: '', dataReferencia: '', kmInicial: '', kmFinal: '', obs: '' });
            setShowUsoForm(false);
            carregarFicha();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao registrar uso.');
        } finally {
            setSavingUso(false);
        }
    };

    const handleRegistrarAbastecimento = async (e) => {
        e.preventDefault();
        try {
            setSavingAbast(true);
            await api.post(`/veiculos/${veiculoId}/abastecimento`, {
                dataReferencia: abastForm.dataReferencia,
                litros: abastForm.litros || null,
                valor: abastForm.valor,
                kmNoAbastecimento: abastForm.kmNoAbastecimento || null,
                descricao: abastForm.descricao || null
            });
            toast.success('Abastecimento registrado!');
            setAbastForm({ dataReferencia: '', litros: '', valor: '', kmNoAbastecimento: '', descricao: '' });
            setShowAbastForm(false);
            carregarFicha();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao registrar abastecimento.');
        } finally {
            setSavingAbast(false);
        }
    };

    // ── Editar / Excluir abastecimento ──
    const handleEditAbast = (d) => {
        setEditingAbastId(d.id);
        setEditAbastForm({
            dataReferencia: d.dataReferencia || '',
            litros: d.litros ? String(Number(d.litros)) : '',
            valor: d.valor ? String(Number(d.valor)) : '',
            kmNoAbastecimento: d.kmNoAbastecimento ? String(d.kmNoAbastecimento) : '',
            descricao: d.descricao || ''
        });
    };

    const handleSalvarEditAbast = async (despesaId) => {
        try {
            setSavingAbast(true);
            await api.put(`/veiculos/${veiculoId}/abastecimento/${despesaId}`, {
                dataReferencia: editAbastForm.dataReferencia,
                litros: editAbastForm.litros || null,
                valor: editAbastForm.valor,
                kmNoAbastecimento: editAbastForm.kmNoAbastecimento || null,
                descricao: editAbastForm.descricao || null
            });
            toast.success('Abastecimento atualizado!');
            setEditingAbastId(null);
            carregarFicha();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao atualizar abastecimento.');
        } finally {
            setSavingAbast(false);
        }
    };

    const handleExcluirAbast = async (despesaId) => {
        if (!confirm('Excluir este abastecimento?')) return;
        try {
            await api.delete(`/veiculos/${veiculoId}/abastecimento/${despesaId}`);
            toast.success('Abastecimento excluído!');
            carregarFicha();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao excluir abastecimento.');
        }
    };

    // ── Editar / Excluir uso manual ──
    const handleEditUso = (d) => {
        const obsClean = (d.obs || '').replace(/^\[Uso Interno[^\]]*\]\s*/, '');
        const isExterno = (d.obs || '').includes('[Uso Interno -');
        const nomeMatch = (d.obs || '').match(/\[Uso Interno - ([^\]]+)\]/);
        setEditingUsoId(d.id);
        setEditUsoForm({
            motoristaId: d.vendedorId || '',
            motoristaNome: nomeMatch ? nomeMatch[1] : '',
            dataReferencia: d.dataReferencia || '',
            kmInicial: d.kmInicial ? String(d.kmInicial) : '',
            kmFinal: d.kmFinal ? String(d.kmFinal) : '',
            obs: obsClean
        });
    };

    const handleSalvarEditUso = async (diarioId) => {
        try {
            setSavingUso(true);
            await api.put(`/veiculos/${veiculoId}/uso-manual/${diarioId}`, {
                motoristaId: editUsoForm.motoristaId || null,
                motoristaNome: editUsoForm.motoristaNome || null,
                dataReferencia: editUsoForm.dataReferencia,
                kmInicial: parseInt(editUsoForm.kmInicial),
                kmFinal: parseInt(editUsoForm.kmFinal),
                obs: editUsoForm.obs || null
            });
            toast.success('Uso atualizado!');
            setEditingUsoId(null);
            carregarFicha();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao atualizar uso.');
        } finally {
            setSavingUso(false);
        }
    };

    const handleExcluirUso = async (diarioId) => {
        if (!confirm('Excluir este registro de uso?')) return;
        try {
            await api.delete(`/veiculos/${veiculoId}/uso-manual/${diarioId}`);
            toast.success('Registro de uso excluído!');
            carregarFicha();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao excluir uso.');
        }
    };

    const handleUploadDocumento = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setUploadingDoc(true);
            const fd = new FormData();
            fd.append('documento', file);
            await api.post(`/veiculos/${veiculoId}/upload-documento`, fd, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            toast.success('Documento salvo!');
            carregarFicha();
        } catch (err) {
            toast.error('Erro ao salvar documento.');
        } finally {
            setUploadingDoc(false);
            if (docInputRef.current) docInputRef.current.value = '';
        }
    };

    const handleUploadApolice = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setUploadingApolice(true);
            const fd = new FormData();
            fd.append('apolice', file);
            await api.post(`/veiculos/${veiculoId}/upload-apolice`, fd, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            toast.success('Apólice salva!');
            carregarFicha();
        } catch (err) {
            toast.error('Erro ao salvar apólice.');
        } finally {
            setUploadingApolice(false);
            if (apoliceInputRef.current) apoliceInputRef.current.value = '';
        }
    };

    const stats = ficha?.stats || {};
    const visibleTabs = TABS.filter(tab => !allowedTabs || allowedTabs.includes(tab.id));
    const diasSeguro = diasParaVencer(ficha?.seguroVencimento);
    const pendentes = ficha?.alertasManutencao?.filter(a => !a.concluido) || [];

    useEffect(() => {
        if (!visibleTabs.some(tab => tab.id === activeTab)) {
            setActiveTab(visibleTabs[0]?.id || 'resumo');
        }
    }, [activeTab, visibleTabs]);

    if (loading) {
        return (
            <div className="fixed inset-0 z-[70] flex">
                <div className="ml-auto w-full max-w-2xl h-full bg-white shadow-2xl flex items-center justify-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[70] flex">
            {/* Overlay */}
            <div className="flex-1 bg-black bg-opacity-50" onClick={onClose} />

            {/* Painel */}
            <div className="w-full max-w-2xl h-full bg-white shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="bg-gray-900 text-white px-5 py-4 flex items-center justify-between shrink-0">
                    <div>
                        <div className="flex items-center gap-3">
                            <Car className="h-5 w-5 text-blue-400" />
                            <span className="text-lg font-bold font-mono tracking-wider">{ficha?.placa}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ficha?.ativo ? 'bg-green-800 text-green-200' : 'bg-red-900 text-red-200'}`}>
                                {ficha?.ativo ? 'Ativo' : 'Inativo'}
                            </span>
                        </div>
                        <p className="text-sm text-gray-400 mt-0.5">{ficha?.modelo}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {readOnly ? (
                            <span className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-200">Somente leitura</span>
                        ) : editando ? (
                            <>
                                <button onClick={() => setEditando(false)} className="text-gray-400 hover:text-gray-200 text-sm px-3 py-1.5 border border-gray-600 rounded-md">Cancelar</button>
                                <button onClick={salvarFicha} disabled={saving} className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-md font-medium">
                                    <Save className="h-4 w-4" /> {saving ? 'Salvando...' : 'Salvar'}
                                </button>
                            </>
                        ) : (
                            <button onClick={() => setEditando(true)} className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-md">
                                <Edit3 className="h-4 w-4" /> Editar
                            </button>
                        )}
                        <button onClick={onClose} className="text-gray-400 hover:text-white ml-1"><X className="h-6 w-6" /></button>
                    </div>
                </div>

                {/* Abas */}
                <div className="border-b border-gray-200 bg-white shrink-0 overflow-x-auto">
                    <div className="flex">
                        {visibleTabs.map(tab => {
                            const Icon = tab.icon;
                            const hasBadge = (tab.id === 'manutencao' && pendentes.length > 0) ||
                                (tab.id === 'documentos' && diasSeguro !== null && diasSeguro <= 30);
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`relative flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === tab.id ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                                >
                                    <Icon className="h-4 w-4" />
                                    {tab.label}
                                    {hasBadge && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Conteúdo */}
                <div className="flex-1 overflow-y-auto p-5">

                    {/* ── RESUMO ── */}
                    {activeTab === 'resumo' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {[
                                    { label: 'KM Atual', value: stats.kmAtual ? `${stats.kmAtual.toLocaleString('pt-BR')} km` : '—', color: 'bg-blue-50 text-blue-900' },
                                    { label: 'KM Médio/Dia', value: stats.kmMedioPorDia ? `${stats.kmMedioPorDia.toLocaleString('pt-BR')} km` : '—', color: 'bg-green-50 text-green-900' },
                                    { label: 'Consumo Médio', value: stats.consumoMedioReal ? `${stats.consumoMedioReal} km/L` : '—', color: 'bg-orange-50 text-orange-900' },
                                    { label: 'Dias Rodados', value: stats.totalDiarios, color: 'bg-gray-50 text-gray-900' },
                                    { label: 'Abastecimentos', value: stats.totalAbastecimentos, color: 'bg-gray-50 text-gray-900' },
                                    { label: 'Alertas Pendentes', value: stats.alertasPendentes, color: stats.alertasPendentes > 0 ? 'bg-red-50 text-red-900' : 'bg-gray-50 text-gray-900' },
                                ].map(({ label, value, color }) => (
                                    <div key={label} className={`${color} rounded-xl p-3 text-center`}>
                                        <p className="text-2xl font-bold font-mono">{value}</p>
                                        <p className="text-xs mt-1 opacity-70">{label}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Últimos usos */}
                            {ficha?.diarios?.slice(0, 3).map(d => (
                                <div key={d.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-gray-900">{d.vendedor?.nome}</p>
                                        <p className="text-xs text-gray-500">{formatDate(d.dataReferencia)}</p>
                                    </div>
                                    {d.kmInicial && d.kmFinal ? (
                                        <div className="text-right">
                                            <p className="text-sm font-mono font-bold text-gray-800">+{(d.kmFinal - d.kmInicial).toLocaleString('pt-BR')} km</p>
                                            <p className="text-xs text-gray-500">{d.kmInicial.toLocaleString('pt-BR')} → {d.kmFinal.toLocaleString('pt-BR')}</p>
                                        </div>
                                    ) : <span className="text-xs text-gray-400">Pendente</span>}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── DOCUMENTOS ── */}
                    {activeTab === 'documentos' && (
                        <div className="space-y-5">
                            <div>
                                <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2"><FileText className="h-4 w-4" /> CRLV / Documento</h3>
                                <input type="file" ref={docInputRef} accept="image/*,application/pdf" className="hidden" onChange={handleUploadDocumento} />
                                {ficha?.documentoUrl ? (
                                    <div className="flex items-center gap-3">
                                        {ficha.documentoUrl.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                                            <img src={`${API_URL}${ficha.documentoUrl}`} alt="Documento" className="h-32 rounded-lg border border-gray-200 object-cover" />
                                        ) : (
                                            <a href={`${API_URL}${ficha.documentoUrl}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100">
                                                <FileText className="h-4 w-4" /> Ver Documento
                                            </a>
                                        )}
                                        {!readOnly && (
                                            <button onClick={() => docInputRef.current?.click()} disabled={uploadingDoc}
                                                className="px-3 py-2 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-1.5">
                                                <Upload className="h-3.5 w-3.5" /> {uploadingDoc ? 'Enviando...' : 'Trocar'}
                                            </button>
                                        )}
                                    </div>
                                ) : !readOnly ? (
                                    <button onClick={() => docInputRef.current?.click()} disabled={uploadingDoc}
                                        className="px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 w-full flex items-center justify-center gap-2">
                                        <Upload className="h-4 w-4" /> {uploadingDoc ? 'Enviando...' : 'Enviar Documento (imagem ou PDF)'}
                                    </button>
                                ) : <p className="text-sm text-gray-400">Nenhum documento anexado.</p>}
                            </div>

                            <hr />

                            <div>
                                <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                                    <Shield className="h-4 w-4" /> Seguro
                                    {diasSeguro !== null && diasSeguro <= 30 && (
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${diasSeguro <= 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {diasSeguro <= 0 ? 'Vencido!' : `Vence em ${diasSeguro} dias`}
                                        </span>
                                    )}
                                </h3>

                                {editando ? (
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs text-gray-500 mb-1">Seguradora</label>
                                                <input type="text" value={form.seguroSeguradora} onChange={e => setForm(p => ({ ...p, seguroSeguradora: e.target.value }))}
                                                    placeholder="Ex: Porto Seguro" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-500 mb-1">Apolice Nr</label>
                                                <input type="text" value={form.seguroApolice} onChange={e => setForm(p => ({ ...p, seguroApolice: e.target.value }))}
                                                    placeholder="Numero da apolice" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">Vencimento do Seguro</label>
                                            <input type="date" value={form.seguroVencimento} onChange={e => setForm(p => ({ ...p, seguroVencimento: e.target.value }))}
                                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-500">Seguradora</span>
                                            <span className="font-medium text-gray-900">{ficha?.seguroSeguradora || '—'}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-500">Apolice</span>
                                            <span className="font-medium text-gray-900">{ficha?.seguroApolice || '—'}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-500">Vencimento</span>
                                            <span className={`font-medium ${diasSeguro !== null && diasSeguro <= 30 ? 'text-red-600' : 'text-gray-900'}`}>
                                                {formatDate(ficha?.seguroVencimento)}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* Upload de Apolice */}
                                <div className="mt-4 pt-3 border-t border-gray-100">
                                    <label className="block text-xs text-gray-500 font-medium mb-2">Arquivo da Apolice</label>
                                    <input type="file" ref={apoliceInputRef} accept="image/*,application/pdf" className="hidden" onChange={handleUploadApolice} />
                                    {ficha?.seguroApoliceUrl ? (
                                        <div className="flex items-center gap-3">
                                            {ficha.seguroApoliceUrl.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                                                <img src={`${API_URL}${ficha.seguroApoliceUrl}`} alt="Apolice" className="h-32 rounded-lg border border-gray-200 object-cover" />
                                            ) : (
                                                <a href={`${API_URL}${ficha.seguroApoliceUrl}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg text-sm font-medium hover:bg-green-100">
                                                    <FileText className="h-4 w-4" /> Ver Apolice
                                                </a>
                                            )}
                                            {!readOnly && (
                                                <button onClick={() => apoliceInputRef.current?.click()} disabled={uploadingApolice}
                                                    className="px-3 py-2 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-1.5">
                                                    <Upload className="h-3.5 w-3.5" /> {uploadingApolice ? 'Enviando...' : 'Trocar'}
                                                </button>
                                            )}
                                        </div>
                                    ) : !readOnly ? (
                                        <button onClick={() => apoliceInputRef.current?.click()} disabled={uploadingApolice}
                                            className="px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-green-400 hover:text-green-600 w-full flex items-center justify-center gap-2">
                                            <Upload className="h-4 w-4" /> {uploadingApolice ? 'Enviando...' : 'Enviar Apolice (imagem ou PDF)'}
                                        </button>
                                    ) : <p className="text-sm text-gray-400 mt-1">Nenhuma apolice anexada.</p>}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── MANUTENÇÃO ── */}
                    {activeTab === 'manutencao' && (
                        <div className="space-y-5">
                            {/* Form novo alerta */}
                            {!readOnly && (
                            <form onSubmit={handleCriarAlerta} className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                                <h3 className="text-sm font-bold text-amber-900">Novo Alerta de Manutenção</h3>
                                <select required value={novoAlerta.tipo} onChange={e => setNovoAlerta(p => ({ ...p, tipo: e.target.value }))}
                                    className="w-full border border-gray-300 rounded-md p-2 text-sm">
                                    <option value="">Tipo de manutenção...</option>
                                    {TIPOS_MANUTENCAO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                                <input type="text" placeholder="Descrição (opcional)" value={novoAlerta.descricao}
                                    onChange={e => setNovoAlerta(p => ({ ...p, descricao: e.target.value }))}
                                    className="w-full border border-gray-300 rounded-md p-2 text-sm" />
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs text-gray-600 mb-1">Alerta por KM</label>
                                        <input type="number" placeholder="Ex: 150000" value={novoAlerta.kmAlerta}
                                            onChange={e => setNovoAlerta(p => ({ ...p, kmAlerta: e.target.value }))}
                                            className="w-full border border-gray-300 rounded-md p-2 text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-600 mb-1">Alerta por Data</label>
                                        <input type="date" value={novoAlerta.dataAlerta}
                                            onChange={e => setNovoAlerta(p => ({ ...p, dataAlerta: e.target.value }))}
                                            className="w-full border border-gray-300 rounded-md p-2 text-sm" />
                                    </div>
                                </div>
                                <button type="submit" disabled={savingAlerta} className="w-full py-2 bg-amber-600 text-white rounded-md text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
                                    {savingAlerta ? 'Criando...' : 'Criar Alerta'}
                                </button>
                            </form>
                            )}

                            {/* Lista de alertas */}
                            <div className="space-y-2">
                                {(ficha?.alertasManutencao || []).map(a => (
                                    <div key={a.id} className={`p-3 rounded-lg border ${a.concluido ? 'bg-gray-50 border-gray-200 opacity-50' : 'bg-white border-amber-200'}`}>
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    {a.concluido ? <CheckCircle className="h-4 w-4 text-green-600" /> : <BellRing className="h-4 w-4 text-amber-600" />}
                                                    <span className="text-sm font-medium">{a.tipo?.replace(/_/g, ' ')}</span>
                                                </div>
                                                {a.descricao && <p className="text-xs text-gray-500 mt-1 ml-6">{a.descricao}</p>}
                                                <div className="text-xs text-gray-400 mt-1 ml-6 space-x-3">
                                                    {a.kmAlerta && <span>KM: {a.kmAlerta.toLocaleString('pt-BR')}</span>}
                                                    {a.dataAlerta && <span>Data: {new Date(a.dataAlerta).toLocaleDateString('pt-BR')}</span>}
                                                </div>
                                            </div>
                                            {!readOnly && !a.concluido && (
                                                <button onClick={() => handleConcluirAlerta(a.id)}
                                                    className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded font-medium hover:bg-green-200">
                                                    Concluir
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {ficha?.alertasManutencao?.length === 0 && (
                                    <p className="text-center text-gray-400 py-6 text-sm">Nenhum alerta cadastrado.</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── CONSUMO ── */}
                    {activeTab === 'consumo' && (
                        <div className="space-y-5">
                            {/* Cards de médias */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
                                    <div className="flex justify-center mb-2"><TrendingUp className="h-6 w-6 text-orange-500" /></div>
                                    <p className="text-2xl font-bold font-mono text-orange-900">
                                        {stats.consumoMedioReal ? `${stats.consumoMedioReal} km/L` : '—'}
                                    </p>
                                    <p className="text-xs text-orange-700 mt-1">Consumo médio real</p>
                                    <p className="text-[10px] text-orange-500 mt-0.5">calculado dos abastecimentos</p>
                                </div>
                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                                    <div className="flex justify-center mb-2"><ChevronRight className="h-6 w-6 text-blue-500" /></div>
                                    <p className="text-2xl font-bold font-mono text-blue-900">
                                        {stats.kmMedioPorDia ? `${stats.kmMedioPorDia.toLocaleString('pt-BR')} km` : '—'}
                                    </p>
                                    <p className="text-xs text-blue-700 mt-1">KM médio por dia</p>
                                    <p className="text-[10px] text-blue-500 mt-0.5">baseado em {ficha?.diarios?.filter(d => d.kmFinal).length || 0} diárias</p>
                                </div>
                            </div>

                            {/* Base manual de KM médio */}
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
                                <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                    🎯 KM Médio Sugerido (base manual)
                                </h3>
                                <p className="text-xs text-gray-500">
                                    Defina uma estimativa inicial de quantos km este veículo roda por dia. Com o tempo, a média real calculada dos diários substituirá esse valor como referência.
                                </p>
                                {editando ? (
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">KM por dia (estimativa)</label>
                                        <input type="number" value={form.kmMedioSugerido}
                                            onChange={e => setForm(p => ({ ...p, kmMedioSugerido: e.target.value }))}
                                            placeholder="Ex: 150"
                                            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-gray-600">Estimativa configurada:</span>
                                        <span className="font-bold text-gray-900 font-mono">
                                            {ficha?.kmMedioSugerido ? `${ficha.kmMedioSugerido} km/dia` : 'Não definido'}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Capacidade do tanque */}
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                                <h3 className="text-sm font-bold text-gray-700 mb-2">⛽ Capacidade do Tanque</h3>
                                {editando ? (
                                    <input type="number" step="0.5" value={form.capacidadeTanque}
                                        onChange={e => setForm(p => ({ ...p, capacidadeTanque: e.target.value }))}
                                        placeholder="Ex: 50 (litros)"
                                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                                ) : (
                                    <p className="text-lg font-bold text-gray-900 font-mono">
                                        {ficha?.capacidadeTanque ? `${Number(ficha.capacidadeTanque)} L` : '—'}
                                    </p>
                                )}
                            </div>

                            {/* Registrar abastecimento */}
                            {!readOnly && (!showAbastForm ? (
                                <button
                                    onClick={() => setShowAbastForm(true)}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg text-sm font-medium hover:bg-orange-100 transition-colors"
                                >
                                    <Plus className="h-4 w-4" /> Registrar Abastecimento
                                </button>
                            ) : (
                                <form onSubmit={handleRegistrarAbastecimento} className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-orange-900">Novo Abastecimento</h3>
                                        <button type="button" onClick={() => setShowAbastForm(false)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
                                    </div>

                                    <div>
                                        <label className="block text-xs text-gray-600 mb-1">Data *</label>
                                        <input type="date" required value={abastForm.dataReferencia}
                                            onChange={e => setAbastForm(p => ({ ...p, dataReferencia: e.target.value }))}
                                            className="w-full border border-gray-300 rounded-md p-2 text-sm" />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs text-gray-600 mb-1">Litros</label>
                                            <input type="number" step="0.01" value={abastForm.litros}
                                                onChange={e => setAbastForm(p => ({ ...p, litros: e.target.value }))}
                                                placeholder="Ex: 45.5"
                                                className="w-full border border-gray-300 rounded-md p-2 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-600 mb-1">Valor (R$) *</label>
                                            <input type="number" step="0.01" required value={abastForm.valor}
                                                onChange={e => setAbastForm(p => ({ ...p, valor: e.target.value }))}
                                                placeholder="Ex: 250.00"
                                                className="w-full border border-gray-300 rounded-md p-2 text-sm" />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs text-gray-600 mb-1">KM no Hodômetro</label>
                                        <input type="number" value={abastForm.kmNoAbastecimento}
                                            onChange={e => setAbastForm(p => ({ ...p, kmNoAbastecimento: e.target.value }))}
                                            placeholder="Ex: 145000"
                                            className="w-full border border-gray-300 rounded-md p-2 text-sm" />
                                        <p className="text-[10px] text-gray-400 mt-1">Informar o KM melhora o cálculo de consumo</p>
                                    </div>

                                    <div>
                                        <label className="block text-xs text-gray-600 mb-1">Descrição</label>
                                        <input type="text" value={abastForm.descricao}
                                            onChange={e => setAbastForm(p => ({ ...p, descricao: e.target.value }))}
                                            placeholder="Ex: Posto Shell BR-116"
                                            className="w-full border border-gray-300 rounded-md p-2 text-sm" />
                                    </div>

                                    <button type="submit" disabled={savingAbast}
                                        className="w-full py-2 bg-orange-600 text-white rounded-md text-sm font-medium hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2">
                                        {savingAbast && <Loader className="h-4 w-4 animate-spin" />}
                                        {savingAbast ? 'Registrando...' : 'Registrar Abastecimento'}
                                    </button>
                                </form>
                            ))}

                            {/* Últimos abastecimentos */}
                            {ficha?.despesas?.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-bold text-gray-700 mb-2">Últimos Abastecimentos</h3>
                                    <div className="space-y-2">
                                        {/* Ordena por KM decrescente (mais recente no topo), sem KM vai para o final */}
                                        {[...ficha.despesas]
                                            .sort((a, b) => (Number(b.kmNoAbastecimento) || 0) - (Number(a.kmNoAbastecimento) || 0))
                                            .slice(0, 10)
                                            .map((d, idx, arr) => {
                                                const kmAtual = d.kmNoAbastecimento ? Number(d.kmNoAbastecimento) : null;
                                                const proxItem = arr[idx + 1];
                                                const kmAnterior = proxItem?.kmNoAbastecimento ? Number(proxItem.kmNoAbastecimento) : null;
                                                const kmRodados = kmAtual && kmAnterior ? kmAtual - kmAnterior : null;
                                                const litros = d.litros ? Number(d.litros) : 0;
                                                const eficiencia = kmRodados && litros >= 5 ? (kmRodados / litros).toFixed(1) : null;

                                                // Modo edição inline
                                                if (!readOnly && editingAbastId === d.id) {
                                                    return (
                                                        <div key={d.id} className="bg-orange-50 border-2 border-orange-300 rounded-lg p-3 space-y-2">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-xs font-bold text-orange-800">Editando Abastecimento</span>
                                                                <button onClick={() => setEditingAbastId(null)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
                                                            </div>
                                                            <div>
                                                                <label className="block text-[10px] text-gray-500 mb-0.5">Data</label>
                                                                <input type="date" value={editAbastForm.dataReferencia}
                                                                    onChange={e => setEditAbastForm(p => ({ ...p, dataReferencia: e.target.value }))}
                                                                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <div>
                                                                    <label className="block text-[10px] text-gray-500 mb-0.5">Litros</label>
                                                                    <input type="number" step="0.01" value={editAbastForm.litros}
                                                                        onChange={e => setEditAbastForm(p => ({ ...p, litros: e.target.value }))}
                                                                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[10px] text-gray-500 mb-0.5">Valor (R$)</label>
                                                                    <input type="number" step="0.01" value={editAbastForm.valor}
                                                                        onChange={e => setEditAbastForm(p => ({ ...p, valor: e.target.value }))}
                                                                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <label className="block text-[10px] text-gray-500 mb-0.5">KM Hodômetro</label>
                                                                <input type="number" value={editAbastForm.kmNoAbastecimento}
                                                                    onChange={e => setEditAbastForm(p => ({ ...p, kmNoAbastecimento: e.target.value }))}
                                                                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                                                            </div>
                                                            <div>
                                                                <label className="block text-[10px] text-gray-500 mb-0.5">Descrição</label>
                                                                <input type="text" value={editAbastForm.descricao}
                                                                    onChange={e => setEditAbastForm(p => ({ ...p, descricao: e.target.value }))}
                                                                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <button onClick={() => handleSalvarEditAbast(d.id)} disabled={savingAbast}
                                                                    className="flex-1 py-1.5 bg-orange-600 text-white rounded text-xs font-medium hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-1">
                                                                    {savingAbast ? <Loader className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Salvar
                                                                </button>
                                                                <button onClick={() => setEditingAbastId(null)}
                                                                    className="px-3 py-1.5 bg-gray-200 text-gray-600 rounded text-xs font-medium hover:bg-gray-300">
                                                                    Cancelar
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                }

                                                return (
                                                    <div key={d.id} className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-2.5">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-[11px] text-gray-400">{formatDate(d.dataReferencia)}</p>
                                                                {kmAtual ? (
                                                                    <p className="text-[13px] font-bold font-mono text-gray-800 mt-0.5">
                                                                        {kmAtual.toLocaleString('pt-BR')} km
                                                                    </p>
                                                                ) : (
                                                                    <p className="text-[11px] text-amber-600 mt-0.5">KM não informado</p>
                                                                )}
                                                                {kmRodados !== null && kmRodados > 0 && (
                                                                    <p className="text-[11px] text-gray-500 mt-0.5">
                                                                        {kmRodados.toLocaleString('pt-BR')} km rodados
                                                                        {eficiencia && (
                                                                            <span className={`ml-1.5 font-semibold ${Number(eficiencia) > 20 ? 'text-green-600' : 'text-orange-600'}`}>
                                                                                · {eficiencia} km/L
                                                                            </span>
                                                                        )}
                                                                    </p>
                                                                )}
                                                                {d.descricao && <p className="text-[10px] text-gray-400 mt-0.5">{d.descricao}</p>}
                                                            </div>
                                                            <div className="text-right shrink-0 flex flex-col items-end gap-1">
                                                                {litros > 0 && (
                                                                    <p className="text-[12px] text-gray-600 font-mono">{litros}L</p>
                                                                )}
                                                                <p className="text-[13px] font-bold text-gray-900 font-mono">
                                                                    R$ {Number(d.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                </p>
                                                                {!readOnly && <div className="flex gap-1 mt-1">
                                                                    <button onClick={() => handleEditAbast(d)} className="p-1 text-gray-400 hover:text-orange-600 hover:bg-orange-100 rounded transition-colors" title="Editar">
                                                                        <Edit3 className="h-3.5 w-3.5" />
                                                                    </button>
                                                                    <button onClick={() => handleExcluirAbast(d.id)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Excluir">
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </button>
                                                                </div>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                    {ficha.despesas.some(d => !d.kmNoAbastecimento) && (
                                        <p className="text-[11px] text-gray-400 mt-2 italic">
                                            💡 Abastecimentos sem KM não entram no cálculo de consumo. Edite pelo Caixa para incluir o hodômetro.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── HISTÓRICO MOTORISTAS ── */}
                    {activeTab === 'historico' && (
                        <div className="space-y-3">
                            {/* Botão para abrir formulário de uso manual */}
                            {!readOnly && (!showUsoForm ? (
                                <button
                                    onClick={() => setShowUsoForm(true)}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors"
                                >
                                    <Plus className="h-4 w-4" /> Registrar Uso Manual
                                </button>
                            ) : (
                                <form onSubmit={handleRegistrarUso} className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-indigo-900">Autorização de Uso</h3>
                                        <button type="button" onClick={() => setShowUsoForm(false)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
                                    </div>

                                    <div>
                                        <label className="block text-xs text-gray-600 mb-1">Motorista (do sistema)</label>
                                        <select
                                            value={usoForm.motoristaId}
                                            onChange={e => setUsoForm(p => ({ ...p, motoristaId: e.target.value }))}
                                            className="w-full border border-gray-300 rounded-md p-2 text-sm"
                                        >
                                            <option value="">Selecione (ou digite nome abaixo)</option>
                                            {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                                        </select>
                                    </div>

                                    {!usoForm.motoristaId && (
                                        <div>
                                            <label className="block text-xs text-gray-600 mb-1">Nome do motorista (externo)</label>
                                            <input type="text" value={usoForm.motoristaNome}
                                                onChange={e => setUsoForm(p => ({ ...p, motoristaNome: e.target.value }))}
                                                placeholder="Ex: João da manutenção"
                                                className="w-full border border-gray-300 rounded-md p-2 text-sm" />
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-xs text-gray-600 mb-1">Data *</label>
                                        <input type="date" required value={usoForm.dataReferencia}
                                            onChange={e => setUsoForm(p => ({ ...p, dataReferencia: e.target.value }))}
                                            className="w-full border border-gray-300 rounded-md p-2 text-sm" />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs text-gray-600 mb-1">KM Inicial *</label>
                                            <input type="number" required value={usoForm.kmInicial}
                                                onChange={e => setUsoForm(p => ({ ...p, kmInicial: e.target.value }))}
                                                placeholder="Ex: 140000"
                                                className="w-full border border-gray-300 rounded-md p-2 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-600 mb-1">KM Final *</label>
                                            <input type="number" required value={usoForm.kmFinal}
                                                onChange={e => setUsoForm(p => ({ ...p, kmFinal: e.target.value }))}
                                                placeholder="Ex: 140150"
                                                className="w-full border border-gray-300 rounded-md p-2 text-sm" />
                                        </div>
                                    </div>

                                    {/* Feedback de conflito de KM */}
                                    {kmConflito && (
                                        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                                            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                            <span>{kmConflito}</span>
                                        </div>
                                    )}
                                    {usoForm.kmInicial && usoForm.kmFinal && parseInt(usoForm.kmFinal) > parseInt(usoForm.kmInicial) && !kmConflito && (
                                        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700">
                                            <CheckCircle className="h-4 w-4 shrink-0" />
                                            <span>Intervalo disponível — {parseInt(usoForm.kmFinal) - parseInt(usoForm.kmInicial)} km</span>
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-xs text-gray-600 mb-1">Observação</label>
                                        <input type="text" value={usoForm.obs}
                                            onChange={e => setUsoForm(p => ({ ...p, obs: e.target.value }))}
                                            placeholder="Motivo do uso"
                                            className="w-full border border-gray-300 rounded-md p-2 text-sm" />
                                    </div>

                                    <button type="submit" disabled={savingUso || !!kmConflito}
                                        className="w-full py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                                        {savingUso && <Loader className="h-4 w-4 animate-spin" />}
                                        {savingUso ? 'Registrando...' : 'Registrar Uso'}
                                    </button>
                                </form>
                            ))}

                            {(ficha?.diarios || []).length === 0 ? (
                                <p className="text-center text-gray-400 py-10 text-sm">Nenhum histórico de uso.</p>
                            ) : ficha.diarios.map((d, idx) => {
                                // Modo edição inline
                                if (!readOnly && editingUsoId === d.id) {
                                    return (
                                        <div key={d.id} className="bg-indigo-50 border-2 border-indigo-300 rounded-lg p-3 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold text-indigo-800">Editando Uso</span>
                                                <button onClick={() => setEditingUsoId(null)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] text-gray-500 mb-0.5">Motorista (do sistema)</label>
                                                <select value={editUsoForm.motoristaId}
                                                    onChange={e => setEditUsoForm(p => ({ ...p, motoristaId: e.target.value }))}
                                                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                                                    <option value="">Selecione (ou digite nome abaixo)</option>
                                                    {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                                                </select>
                                            </div>
                                            {!editUsoForm.motoristaId && (
                                                <div>
                                                    <label className="block text-[10px] text-gray-500 mb-0.5">Nome motorista (externo)</label>
                                                    <input type="text" value={editUsoForm.motoristaNome}
                                                        onChange={e => setEditUsoForm(p => ({ ...p, motoristaNome: e.target.value }))}
                                                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                                                </div>
                                            )}
                                            <div>
                                                <label className="block text-[10px] text-gray-500 mb-0.5">Data</label>
                                                <input type="date" value={editUsoForm.dataReferencia}
                                                    onChange={e => setEditUsoForm(p => ({ ...p, dataReferencia: e.target.value }))}
                                                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="block text-[10px] text-gray-500 mb-0.5">KM Inicial</label>
                                                    <input type="number" value={editUsoForm.kmInicial}
                                                        onChange={e => setEditUsoForm(p => ({ ...p, kmInicial: e.target.value }))}
                                                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] text-gray-500 mb-0.5">KM Final</label>
                                                    <input type="number" value={editUsoForm.kmFinal}
                                                        onChange={e => setEditUsoForm(p => ({ ...p, kmFinal: e.target.value }))}
                                                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] text-gray-500 mb-0.5">Observação</label>
                                                <input type="text" value={editUsoForm.obs}
                                                    onChange={e => setEditUsoForm(p => ({ ...p, obs: e.target.value }))}
                                                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => handleSalvarEditUso(d.id)} disabled={savingUso}
                                                    className="flex-1 py-1.5 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1">
                                                    {savingUso ? <Loader className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Salvar
                                                </button>
                                                <button onClick={() => setEditingUsoId(null)}
                                                    className="px-3 py-1.5 bg-gray-200 text-gray-600 rounded text-xs font-medium hover:bg-gray-300">
                                                    Cancelar
                                                </button>
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div key={d.id} className="bg-white border border-gray-200 rounded-lg p-3 hover:bg-gray-50">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${d.kmFinal ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                    {idx + 1}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-gray-900">{d.vendedor?.nome || '—'}</p>
                                                    <p className="text-xs text-gray-500">{formatDate(d.dataReferencia)} · {d.modo === 'PRESENCIAL' ? 'Presencial' : 'Home Office'}</p>
                                                    {d.kmInicial && (
                                                        <p className="text-xs text-gray-600 mt-1 font-mono">
                                                            KM {d.kmInicial.toLocaleString('pt-BR')} → {d.kmFinal ? d.kmFinal.toLocaleString('pt-BR') : 'pendente'}
                                                            {d.kmFinal && <span className="ml-2 font-bold text-blue-700">+{(d.kmFinal - d.kmInicial).toLocaleString('pt-BR')} km</span>}
                                                        </p>
                                                    )}
                                                    {d.obs && <p className="text-xs text-amber-700 mt-1 bg-amber-50 px-2 py-0.5 rounded">{d.obs}</p>}
                                                </div>
                                            </div>
                                            {!readOnly && <div className="flex items-center gap-1 shrink-0">
                                                {!d.kmFinal && d.modo === 'PRESENCIAL' && (
                                                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Pendente</span>
                                                )}
                                                <button onClick={() => handleEditUso(d)} className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title="Editar">
                                                    <Edit3 className="h-3.5 w-3.5" />
                                                </button>
                                                <button onClick={() => handleExcluirUso(d.id)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Excluir">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>}
                                        </div>
                                        {/* Checklist resumo */}
                                        {d.checklist && (
                                            <div className="mt-2 flex gap-1 flex-wrap ml-11">
                                                {Object.entries(d.checklist).map(([key, val]) => (
                                                    <span key={key} className={`text-[10px] px-1.5 py-0.5 rounded ${val ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                                        {val ? '✓' : '✗'} {key.replace(/Ok$/, '')}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ── OBSERVAÇÕES ── */}
                    {activeTab === 'obs' && (
                        <div className="space-y-3">
                            {editando ? (
                                <textarea
                                    value={form.observacoes}
                                    onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
                                    rows={12}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                    placeholder="Observações gerais sobre o veículo (avarias, histórico, particularidades...)"
                                />
                            ) : ficha?.observacoes ? (
                                <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap border border-gray-200">
                                    {ficha.observacoes}
                                </div>
                            ) : (
                                <div className="text-center text-gray-400 py-10">
                                    <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
                                    <p className="text-sm">Nenhuma observação registrada.</p>
                                    {!readOnly && <button onClick={() => setEditando(true)} className="mt-3 text-xs text-blue-600 hover:underline">Adicionar observação</button>}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VeiculoFicha;
