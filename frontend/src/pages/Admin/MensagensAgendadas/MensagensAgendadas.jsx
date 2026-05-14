import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Play, BellRing, Phone, X, Save, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import mensagemAgendadaService from '../../../services/mensagemAgendadaService';
import vendedorService from '../../../services/vendedorService';

const DIAS = [
    { sigla: 'SEG', label: 'Seg' },
    { sigla: 'TER', label: 'Ter' },
    { sigla: 'QUA', label: 'Qua' },
    { sigla: 'QUI', label: 'Qui' },
    { sigla: 'SEX', label: 'Sex' },
    { sigla: 'SAB', label: 'Sáb' },
    { sigla: 'DOM', label: 'Dom' },
];

const TIPOS = [{ value: 'meta', label: 'Meta' }];

const FORM_VAZIO = { vendedorId: '', tipo: 'meta', hora: '08:00', diasSemana: ['SEG', 'TER', 'QUA', 'QUI', 'SEX'], ativo: true };

function BadgeDias({ dias }) {
    return (
        <div className="flex flex-wrap gap-1">
            {DIAS.map(d => (
                <span key={d.sigla} className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${dias.includes(d.sigla) ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-300'}`}>
                    {d.label}
                </span>
            ))}
        </div>
    );
}

function Modal({ titulo, onClose, children }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md z-10">
                <div className="flex items-center justify-between px-5 py-4 border-b">
                    <h2 className="text-base font-bold text-gray-800">{titulo}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
                </div>
                <div className="p-5">{children}</div>
            </div>
        </div>
    );
}

export default function MensagensAgendadas() {
    const [configs, setConfigs] = useState([]);
    const [vendedores, setVendedores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalAberto, setModalAberto] = useState(false);
    const [editando, setEditando] = useState(null); // null = novo
    const [form, setForm] = useState(FORM_VAZIO);
    const [salvando, setSalvando] = useState(false);
    const [disparando, setDisparando] = useState(null);
    const [previewTexto, setPreviewTexto] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [busca, setBusca] = useState('');

    const carregar = useCallback(async () => {
        try {
            setLoading(true);
            const [c, v] = await Promise.all([
                mensagemAgendadaService.listar(),
                vendedorService.listar()
            ]);
            setConfigs(c);
            setVendedores(v.filter(v => v.ativo !== false));
        } catch {
            toast.error('Erro ao carregar dados');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { carregar(); }, [carregar]);

    const abrirNovo = () => {
        setEditando(null);
        setForm(FORM_VAZIO);
        setModalAberto(true);
    };

    const abrirEditar = (config) => {
        setEditando(config.id);
        setForm({
            vendedorId: config.vendedorId,
            tipo: config.tipo,
            hora: config.hora,
            diasSemana: config.diasSemana || [],
            ativo: config.ativo
        });
        setModalAberto(true);
    };

    const fecharModal = () => { setModalAberto(false); setEditando(null); };

    const toggleDia = (sigla) => {
        setForm(f => ({
            ...f,
            diasSemana: f.diasSemana.includes(sigla)
                ? f.diasSemana.filter(d => d !== sigla)
                : [...f.diasSemana, sigla]
        }));
    };

    const salvar = async () => {
        if (!form.vendedorId) { toast.error('Selecione um vendedor'); return; }
        if (!form.diasSemana.length) { toast.error('Selecione pelo menos um dia'); return; }
        try {
            setSalvando(true);
            if (editando) {
                await mensagemAgendadaService.atualizar(editando, form);
                toast.success('Mensagem atualizada!');
            } else {
                await mensagemAgendadaService.criar(form);
                toast.success('Mensagem criada!');
            }
            fecharModal();
            carregar();
        } catch {
            toast.error('Erro ao salvar');
        } finally {
            setSalvando(false);
        }
    };

    const deletar = async (id, nome) => {
        if (!window.confirm(`Excluir mensagem de ${nome}?`)) return;
        try {
            await mensagemAgendadaService.deletar(id);
            toast.success('Removido');
            carregar();
        } catch {
            toast.error('Erro ao excluir');
        }
    };

    const disparar = async (id, nome) => {
        try {
            setDisparando(id);
            const res = await mensagemAgendadaService.disparar(id);
            if (res.ok) toast.success(`Mensagem enviada para ${nome}!`);
            else toast.error(`Falha: ${res.motivo}`);
            carregar();
        } catch {
            toast.error('Erro ao disparar');
        } finally {
            setDisparando(null);
        }
    };

    const verPreview = async (vendedorId) => {
        try {
            setPreviewLoading(true);
            const res = await mensagemAgendadaService.preview(vendedorId);
            setPreviewTexto(res.texto);
        } catch {
            toast.error('Erro ao gerar preview');
        } finally {
            setPreviewLoading(false);
        }
    };

    const toggleAtivo = async (config) => {
        try {
            await mensagemAgendadaService.atualizar(config.id, { ativo: !config.ativo });
            carregar();
        } catch { toast.error('Erro'); }
    };

    const filtradas = busca.trim()
        ? configs.filter(c => c.vendedor?.nome?.toLowerCase().includes(busca.toLowerCase()))
        : configs;

    const fmtUltimoEnvio = (dt) => {
        if (!dt) return '—';
        return new Date(dt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="max-w-5xl mx-auto px-3 md:px-6 py-4 md:py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <BellRing className="h-6 w-6 text-indigo-600" />
                        Mensagens Agendadas
                    </h1>
                    <p className="text-xs text-gray-500 mt-0.5">Envios automáticos de relatórios via WhatsApp</p>
                </div>
                <button onClick={abrirNovo} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700">
                    <Plus className="h-4 w-4" /> Nova mensagem
                </button>
            </div>

            {/* Busca */}
            <input
                type="text"
                placeholder="Buscar por vendedor..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
                className="w-full max-w-xs px-3 py-1.5 text-sm border rounded-lg bg-gray-50 mb-4 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />

            {/* Tabela desktop */}
            <div className="hidden md:block bg-white shadow rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Vendedor</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tipo</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Horário (SP)</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Dias</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Último envio</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td colSpan={7} className="text-center py-10 text-gray-400">Carregando...</td></tr>
                        ) : filtradas.length === 0 ? (
                            <tr><td colSpan={7} className="text-center py-10 text-gray-400">Nenhuma mensagem cadastrada.</td></tr>
                        ) : filtradas.map(c => (
                            <tr key={c.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3">
                                    <div className="font-medium text-gray-900">{c.vendedor?.nome || '—'}</div>
                                    {c.vendedor?.telefone
                                        ? <div className="text-xs text-gray-400 flex items-center gap-1"><Phone className="h-3 w-3" />{c.vendedor.telefone}</div>
                                        : <div className="text-xs text-red-400">Sem telefone</div>
                                    }
                                </td>
                                <td className="px-4 py-3">
                                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-semibold rounded capitalize">{c.tipo}</span>
                                </td>
                                <td className="px-4 py-3 font-mono text-sm text-gray-700">{c.hora}</td>
                                <td className="px-4 py-3"><BadgeDias dias={c.diasSemana || []} /></td>
                                <td className="px-4 py-3 text-xs text-gray-500">{fmtUltimoEnvio(c.ultimoEnvio)}</td>
                                <td className="px-4 py-3">
                                    <button onClick={() => toggleAtivo(c)} className={`px-2 py-0.5 rounded-full text-xs font-semibold ${c.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                        {c.ativo ? 'Ativo' : 'Inativo'}
                                    </button>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => verPreview(c.vendedorId)} title="Ver preview" className="text-gray-400 hover:text-indigo-600" disabled={previewLoading}>
                                            <Eye className="h-4 w-4" />
                                        </button>
                                        <button onClick={() => disparar(c.id, c.vendedor?.nome)} title="Disparar agora" className="text-gray-400 hover:text-green-600" disabled={!!disparando}>
                                            {disparando === c.id ? <span className="animate-spin inline-block h-4 w-4 border-2 border-green-500 border-t-transparent rounded-full" /> : <Play className="h-4 w-4" />}
                                        </button>
                                        <button onClick={() => abrirEditar(c)} title="Editar" className="text-gray-400 hover:text-indigo-600">
                                            <Pencil className="h-4 w-4" />
                                        </button>
                                        <button onClick={() => deletar(c.id, c.vendedor?.nome)} title="Excluir" className="text-gray-400 hover:text-red-600">
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Cards mobile */}
            <div className="md:hidden space-y-2">
                {loading ? <p className="text-center text-gray-400 py-10">Carregando...</p>
                : filtradas.length === 0 ? <p className="text-center text-gray-400 py-10">Nenhuma mensagem cadastrada.</p>
                : filtradas.map(c => (
                    <div key={c.id} className="bg-white rounded-xl border shadow-sm p-3">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <p className="font-bold text-sm text-gray-900">{c.vendedor?.nome}</p>
                                {c.vendedor?.telefone
                                    ? <p className="text-[11px] text-gray-400 flex items-center gap-1"><Phone className="h-3 w-3" />{c.vendedor.telefone}</p>
                                    : <p className="text-[11px] text-red-400">Sem telefone</p>
                                }
                            </div>
                            <div className="flex gap-1.5">
                                <button onClick={() => verPreview(c.vendedorId)} className="p-1.5 bg-gray-50 text-gray-500 rounded-lg"><Eye className="h-4 w-4" /></button>
                                <button onClick={() => disparar(c.id, c.vendedor?.nome)} className="p-1.5 bg-green-50 text-green-600 rounded-lg" disabled={!!disparando}>
                                    <Play className="h-4 w-4" />
                                </button>
                                <button onClick={() => abrirEditar(c)} className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg"><Pencil className="h-4 w-4" /></button>
                                <button onClick={() => deletar(c.id, c.vendedor?.nome)} className="p-1.5 bg-red-50 text-red-500 rounded-lg"><Trash2 className="h-4 w-4" /></button>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600 mb-2">
                            <span className="font-semibold capitalize">{c.tipo}</span>
                            <span className="font-mono">{c.hora}</span>
                            <button onClick={() => toggleAtivo(c)} className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${c.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                {c.ativo ? 'Ativo' : 'Inativo'}
                            </button>
                        </div>
                        <BadgeDias dias={c.diasSemana || []} />
                        <p className="text-[10px] text-gray-400 mt-1.5">Último envio: {fmtUltimoEnvio(c.ultimoEnvio)}</p>
                    </div>
                ))}
            </div>

            {/* Modal Criar/Editar */}
            {modalAberto && (
                <Modal titulo={editando ? 'Editar Mensagem' : 'Nova Mensagem'} onClose={fecharModal}>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-medium text-gray-600 block mb-1">Vendedor</label>
                            <select value={form.vendedorId} onChange={e => setForm(f => ({ ...f, vendedorId: e.target.value }))}
                                className="w-full px-3 py-2 text-sm border rounded-lg bg-white" disabled={!!editando}>
                                <option value="">Selecione...</option>
                                {vendedores.map(v => (
                                    <option key={v.id} value={v.id}>
                                        {v.nome}{!v.telefone ? ' ⚠️ sem telefone' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-gray-600 block mb-1">Tipo de mensagem</label>
                            <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                                className="w-full px-3 py-2 text-sm border rounded-lg bg-white">
                                {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-gray-600 block mb-1">Horário (fuso São Paulo)</label>
                            <input type="time" value={form.hora} onChange={e => setForm(f => ({ ...f, hora: e.target.value }))}
                                className="w-full px-3 py-2 text-sm border rounded-lg bg-white" />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-gray-600 block mb-2">Dias da semana</label>
                            <div className="flex flex-wrap gap-2">
                                {DIAS.map(d => (
                                    <button key={d.sigla} type="button" onClick={() => toggleDia(d.sigla)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${form.diasSemana.includes(d.sigla) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'}`}>
                                        {d.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <label className="text-xs font-medium text-gray-600">Ativo</label>
                            <button type="button" onClick={() => setForm(f => ({ ...f, ativo: !f.ativo }))}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.ativo ? 'bg-indigo-600' : 'bg-gray-200'}`}>
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.ativo ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button onClick={fecharModal} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
                            <button onClick={salvar} disabled={salvando}
                                className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                                <Save className="h-4 w-4" /> {salvando ? 'Salvando...' : 'Salvar'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Modal Preview */}
            {previewTexto && (
                <Modal titulo="Preview da Mensagem" onClose={() => setPreviewTexto(null)}>
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto font-mono leading-relaxed">
                        {previewTexto}
                    </pre>
                </Modal>
            )}
        </div>
    );
}
