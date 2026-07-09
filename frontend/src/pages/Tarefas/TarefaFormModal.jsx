import React, { useState, useRef } from 'react';
import { X, Paperclip, Link2, FileText, Image as ImageIcon, Trash2, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import SelectBusca from '../../components/SelectBusca';
import MultiSelect from '../../components/MultiSelect';
import tarefaService from '../../services/tarefaService';

// Modal de criar/editar tarefa. Em criação aceita vários responsáveis
// (vira uma tarefa por pessoa); em edição o responsável é único.
const RECORRENCIAS = [
    { value: 'NUNCA', label: 'Não repete' },
    { value: 'DIARIA', label: 'Todo dia' },
    { value: 'DIAS_UTEIS', label: 'Dias úteis (seg a sex)' },
    { value: 'DIAS_SEMANA', label: 'Dias da semana (escolher quais)' },
    { value: 'SEMANAL', label: 'Toda semana (mesmo dia)' },
    { value: 'MENSAL', label: 'Todo mês (mesmo dia)' },
];

const DIAS_SEMANA_OPCOES = [
    { valor: 0, label: 'Dom' }, { valor: 1, label: 'Seg' }, { valor: 2, label: 'Ter' },
    { valor: 3, label: 'Qua' }, { valor: 4, label: 'Qui' }, { valor: 5, label: 'Sex' },
    { valor: 6, label: 'Sáb' },
];

const AnexoChip = ({ icone: Icone, nome, onRemove }) => (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full text-xs font-medium text-gray-700 max-w-full">
        <Icone className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate max-w-[160px]">{nome}</span>
        {onRemove && (
            <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-500 shrink-0">
                <X className="h-3.5 w-3.5" />
            </button>
        )}
    </span>
);

const TarefaFormModal = ({ tarefa, inicial, equipe, podeParaOutros, usuario, onClose, onSalvo }) => {
    const editando = !!tarefa;
    const [form, setForm] = useState(() => ({
        titulo: tarefa?.titulo || '',
        descricao: tarefa?.descricao || '',
        dataInicio: tarefa?.dataInicio || inicial?.dataInicio || '',
        hora: tarefa?.hora || inicial?.hora || '08:00',
        recorrencia: tarefa?.recorrencia || 'NUNCA',
        recorrenciaFim: tarefa?.recorrenciaFim || '',
        diasSemana: tarefa?.diasSemana || [],
        insistir: tarefa ? tarefa.insistir !== false : true,
    }));
    const [responsaveis, setResponsaveis] = useState(() =>
        editando ? [tarefa.responsavel?.id] : [usuario.id]
    );
    const [novosArquivos, setNovosArquivos] = useState([]);
    const [novosLinks, setNovosLinks] = useState([]);
    const [anexosExistentes, setAnexosExistentes] = useState(tarefa?.anexos || []);
    const [linkNome, setLinkNome] = useState('');
    const [linkUrl, setLinkUrl] = useState('');
    const [salvando, setSalvando] = useState(false);
    const fileRef = useRef(null);

    const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));
    const toggleDia = (d) => setForm(f => ({
        ...f,
        diasSemana: f.diasSemana.includes(d) ? f.diasSemana.filter(x => x !== d) : [...f.diasSemana, d].sort(),
    }));

    const addArquivos = (files) => {
        const aceitos = Array.from(files).filter(f =>
            ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(f.type));
        if (aceitos.length < files.length) toast.error('Só imagens (JPG/PNG/WebP) e PDF.');
        setNovosArquivos(prev => [...prev, ...aceitos]);
    };

    const addLink = () => {
        const url = linkUrl.trim();
        if (!url) return;
        const comProtocolo = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        setNovosLinks(prev => [...prev, { nome: linkNome.trim() || url, url: comProtocolo }]);
        setLinkNome(''); setLinkUrl('');
    };

    const removerAnexoExistente = async (anexo) => {
        try {
            await tarefaService.removerAnexo(anexo.id);
            setAnexosExistentes(prev => prev.filter(a => a.id !== anexo.id));
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao remover anexo.');
        }
    };

    const salvar = async () => {
        if (!form.titulo.trim()) return toast.error('Informe o título da tarefa.');
        if (!form.dataInicio) return toast.error('Informe a data.');
        if (!form.hora) return toast.error('Informe o horário do alerta.');
        if (responsaveis.length === 0) return toast.error('Escolha para quem é a tarefa.');
        if (form.recorrencia === 'DIAS_SEMANA' && form.diasSemana.length === 0) {
            return toast.error('Escolha ao menos um dia da semana para repetir.');
        }

        setSalvando(true);
        try {
            const payload = {
                titulo: form.titulo,
                descricao: form.descricao || null,
                dataInicio: form.dataInicio,
                hora: form.hora,
                recorrencia: form.recorrencia,
                recorrenciaFim: form.recorrencia !== 'NUNCA' && form.recorrenciaFim ? form.recorrenciaFim : null,
                diasSemana: form.recorrencia === 'DIAS_SEMANA' ? form.diasSemana : [],
                insistir: form.insistir,
            };

            if (editando) {
                // anexos novos entram ANTES de salvar — assim as cópias p/ outras pessoas já saem com eles
                for (const l of novosLinks) await tarefaService.anexarLink(tarefa.id, l.nome, l.url);
                if (novosArquivos.length > 0) {
                    const fd = new FormData();
                    novosArquivos.forEach(f => fd.append('arquivos', f));
                    await tarefaService.anexarArquivos(tarefa.id, fd);
                }
                const resp = await tarefaService.atualizar(tarefa.id, { ...payload, responsaveis });
                toast.success(resp.copiasCriadas > 0
                    ? `Tarefa atualizada! Criada cópia para +${resp.copiasCriadas} pessoa(s).`
                    : 'Tarefa atualizada!');
            } else {
                const { tarefas: criadas } = await tarefaService.criar({
                    ...payload,
                    responsaveis,
                    linksAjuda: novosLinks,
                });
                if (novosArquivos.length > 0) {
                    for (const t of criadas) {
                        const fd = new FormData();
                        novosArquivos.forEach(f => fd.append('arquivos', f));
                        await tarefaService.anexarArquivos(t.id, fd);
                    }
                }
                toast.success(criadas.length > 1 ? `Tarefa criada para ${criadas.length} pessoas!` : 'Tarefa criada!');
            }
            onSalvo();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao salvar a tarefa.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="bg-mint p-2 rounded-lg"><Plus className="h-4 w-4 text-primary" /></div>
                        <h2 className="text-lg font-bold text-gray-900">{editando ? 'Editar tarefa' : 'Nova tarefa'}</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4 overflow-y-auto">
                    <div>
                        <label className="text-sm font-medium text-gray-700 block mb-1">Título da tarefa *</label>
                        <input
                            value={form.titulo}
                            onChange={e => set('titulo', e.target.value)}
                            placeholder="Ex.: Separar amostras Kit Festa"
                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium text-gray-700 block mb-1">Descrição / instruções</label>
                        <textarea
                            value={form.descricao}
                            onChange={e => set('descricao', e.target.value)}
                            rows={2}
                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="text-sm font-medium text-gray-700 block mb-1">Data *</label>
                            <input type="date" value={form.dataInicio} onChange={e => set('dataInicio', e.target.value)}
                                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 block mb-1">Horário do alerta *</label>
                            <input type="time" value={form.hora} onChange={e => set('hora', e.target.value)}
                                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 block mb-1">Repetir</label>
                            <SelectBusca value={form.recorrencia} onChange={e => set('recorrencia', e.target.value)} className="w-full">
                                {RECORRENCIAS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </SelectBusca>
                        </div>
                    </div>

                    {form.recorrencia === 'DIAS_SEMANA' && (
                        <div>
                            <label className="text-sm font-medium text-gray-700 block mb-1.5">Em quais dias? *</label>
                            <div className="flex flex-wrap gap-1.5">
                                {DIAS_SEMANA_OPCOES.map(d => (
                                    <button key={d.valor} type="button" onClick={() => toggleDia(d.valor)}
                                        className={`px-3.5 py-2 rounded-full text-sm font-semibold min-h-[40px] transition-colors ${form.diasSemana.includes(d.valor)
                                            ? 'bg-primary text-white shadow-sm'
                                            : 'bg-white border border-gray-300 text-gray-600 hover:border-primary hover:text-primary'}`}>
                                        {d.label}
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-gray-500 mt-1.5">Ex.: toque em Seg, Qua e Sex para dias alternados.</p>
                        </div>
                    )}

                    {form.recorrencia !== 'NUNCA' && (
                        <div>
                            <label className="text-sm font-medium text-gray-700 block mb-1">Repetir até (opcional)</label>
                            <input type="date" value={form.recorrenciaFim} onChange={e => set('recorrenciaFim', e.target.value)}
                                className="w-full md:w-1/3 border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                        </div>
                    )}

                    <div>
                        <label className="text-sm font-medium text-gray-700 block mb-1">Para quem é a tarefa? *</label>
                        {podeParaOutros ? (
                            <MultiSelect
                                options={equipe.map(v => ({ id: v.id, nome: v.id === usuario.id ? `${v.nome} (eu)` : v.nome }))}
                                selected={responsaveis}
                                onChange={setResponsaveis}
                                valueKey="id"
                                labelKey="nome"
                                placeholder="Escolha uma ou mais pessoas"
                                searchable
                            />
                        ) : (
                            <div className="w-full border border-gray-200 bg-gray-50 rounded px-3 py-2 text-sm text-gray-600">
                                {usuario.nome} (você)
                            </div>
                        )}
                        {podeParaOutros && (
                            <p className="text-xs text-gray-500 mt-1">Escolhendo mais de uma pessoa, cada uma recebe a própria cópia da tarefa com o mesmo alerta.</p>
                        )}
                    </div>

                    {/* Material de ajuda */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 block mb-1.5">Material de ajuda (opcional)</label>
                        <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf"
                            className="hidden" onChange={e => { addArquivos(e.target.files); e.target.value = ''; }} />
                        <button type="button" onClick={() => fileRef.current?.click()}
                            className="w-full border-2 border-dashed border-gray-300 hover:border-primary rounded-lg p-3.5 text-center text-sm text-gray-500 transition-colors">
                            <Paperclip className="h-4 w-4 inline mr-1.5 -mt-0.5" />
                            Anexar <span className="text-primary font-semibold">imagem ou PDF</span>
                        </button>
                        <div className="flex gap-2 mt-2">
                            <input value={linkNome} onChange={e => setLinkNome(e.target.value)} placeholder="Nome do link (opcional)"
                                className="w-1/3 border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                            <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://…"
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }}
                                className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                            <button type="button" onClick={addLink}
                                className="px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm shrink-0">
                                <Link2 className="h-4 w-4" />
                            </button>
                        </div>
                        {(anexosExistentes.length > 0 || novosArquivos.length > 0 || novosLinks.length > 0) && (
                            <div className="flex flex-wrap gap-2 mt-2.5">
                                {anexosExistentes.map(a => (
                                    <AnexoChip key={a.id}
                                        icone={a.tipo === 'LINK' ? Link2 : a.tipo === 'IMAGEM' ? ImageIcon : FileText}
                                        nome={a.nome}
                                        onRemove={() => removerAnexoExistente(a)} />
                                ))}
                                {novosArquivos.map((f, i) => (
                                    <AnexoChip key={`novo-${i}`}
                                        icone={f.type === 'application/pdf' ? FileText : ImageIcon}
                                        nome={f.name}
                                        onRemove={() => setNovosArquivos(prev => prev.filter((_, j) => j !== i))} />
                                ))}
                                {novosLinks.map((l, i) => (
                                    <AnexoChip key={`link-${i}`} icone={Link2} nome={l.nome}
                                        onRemove={() => setNovosLinks(prev => prev.filter((_, j) => j !== i))} />
                                ))}
                            </div>
                        )}
                    </div>

                    <label className="flex items-center gap-2.5 bg-gray-50 rounded-lg p-3 cursor-pointer">
                        <input type="checkbox" checked={form.insistir} onChange={e => set('insistir', e.target.checked)}
                            className="h-4 w-4 accent-[#00754A]" />
                        <span className="text-sm text-gray-700">
                            Insistir a cada 5 minutos até ser concluída
                            <span className="text-gray-400"> (desmarcado = avisa uma vez só)</span>
                        </span>
                    </label>
                </div>

                {/* Footer */}
                <div className="flex gap-3 px-5 py-4 border-t border-gray-100 shrink-0">
                    <button onClick={salvar} disabled={salvando}
                        className="flex-1 px-4 py-2.5 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50 min-h-[44px]">
                        {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Salvar tarefa'}
                    </button>
                    <button onClick={onClose} disabled={salvando}
                        className="px-5 py-2.5 bg-white border border-gray-300 text-gray-600 rounded-full font-medium text-sm min-h-[44px]">
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TarefaFormModal;
