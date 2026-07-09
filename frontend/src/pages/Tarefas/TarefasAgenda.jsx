import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    CalendarCheck, ChevronLeft, ChevronRight, Plus, Bell, Lock, User as UserIcon,
    Repeat, CheckCircle2, Pencil, Trash2, X, BarChart3,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import SelectBusca from '../../components/SelectBusca';
import AnexosTarefa from '../../components/AnexosTarefa';
import tarefaService, { hojeStr, horaStr } from '../../services/tarefaService';
import TarefaFormModal from './TarefaFormModal';

// ── helpers de data (sempre no fuso local do aparelho) ──
const p2 = (n) => String(n).padStart(2, '0');
const fromStr = (s) => new Date(`${s}T12:00:00`);
const toStr = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const addDias = (s, n) => { const d = fromStr(s); d.setDate(d.getDate() + n); return toStr(d); };
const inicioSemana = (s) => { const d = fromStr(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return toStr(d); }; // segunda
const minutos = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const fmtBR = (s) => s ? s.split('-').reverse().join('/') : '';
const DIAS_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MES_LABEL = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const HORA_INI = 6, HORA_FIM = 20, ALTURA_HORA = 44; // grade: 06h–20h

const RECORRENCIA_LABEL = {
    DIARIA: 'todo dia', DIAS_UTEIS: 'seg a sex', SEMANAL: 'toda semana', MENSAL: 'todo mês',
};

// cor do bloco/card conforme quem criou
const estiloOrigem = (oc, userId) => {
    if (oc.criadaPeloAdmin && oc.criadoPor?.id !== userId) return 'admin';
    if (oc.criadoPor?.id !== userId) return 'colega';
    return 'minha';
};
const CORES_BLOCO = {
    minha: 'bg-mint text-primaryDark border border-primary/20',
    admin: 'bg-house text-white border border-house',
    colega: 'bg-white text-gray-800 border-2 border-amber-400',
};

const BadgeStatus = ({ oc }) => {
    if (oc.status === 'CONCLUIDA') {
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">✓ Concluída {oc.concluidaHora ? `às ${oc.concluidaHora}` : ''}</span>;
    }
    const tocando = oc.dataRef === hojeStr() && minutos(oc.hora) <= minutos(horaStr());
    if (tocando) return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">⏰ Tocando</span>;
    if (oc.dataRef < hojeStr()) return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">Não concluída</span>;
    return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">Pendente</span>;
};

// ── Modal de detalhe da tarefa ──
const TarefaDetalheModal = ({ oc, usuario, onClose, onConcluir, onEditar, onExcluir }) => {
    const podeConcluir = oc.status !== 'CONCLUIDA' &&
        (oc.responsavel?.id === usuario.id || oc.criadoPor?.id === usuario.id || usuario.permissoes?.admin);
    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="bg-house px-5 py-4 flex items-center gap-3 rounded-t-2xl shrink-0">
                    <CalendarCheck className="h-6 w-6 text-white shrink-0" />
                    <div className="text-white flex-1 min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-white/60">
                            {DIAS_LABEL[fromStr(oc.dataRef).getDay()]} {fmtBR(oc.dataRef)} · {oc.hora}
                        </div>
                        <div className="font-bold text-lg leading-tight">{oc.titulo}</div>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-white/70 hover:text-white rounded-full hover:bg-white/10 shrink-0">
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="p-5 space-y-4 overflow-y-auto">
                    <div className="flex items-center gap-2 flex-wrap">
                        <BadgeStatus oc={oc} />
                        {oc.criadaPeloAdmin ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">
                                <Lock className="h-3 w-3" /> Criada por {oc.criadoPor?.nome}
                            </span>
                        ) : (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">
                                Criada por {oc.criadoPor?.id === usuario.id ? 'mim' : oc.criadoPor?.nome}
                            </span>
                        )}
                        {oc.recorrencia !== 'NUNCA' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-mint text-primaryDark">
                                <Repeat className="h-3 w-3" /> Repete: {RECORRENCIA_LABEL[oc.recorrencia]}
                            </span>
                        )}
                    </div>
                    <div className="text-sm text-gray-600">
                        <span className="font-medium text-gray-700">Responsável:</span> {oc.responsavel?.nome}
                        {oc.adiamentos > 0 && <span className="text-gray-400"> · adiou o alerta {oc.adiamentos}×</span>}
                    </div>
                    {oc.descricao && <p className="text-sm text-gray-600 whitespace-pre-wrap">{oc.descricao}</p>}
                    <AnexosTarefa anexos={oc.anexos} />
                    <div className="flex flex-col gap-2.5 pt-1">
                        {podeConcluir && (
                            <button onClick={() => onConcluir(oc)}
                                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm min-h-[44px]">
                                <CheckCircle2 className="h-4 w-4" /> Concluir tarefa
                            </button>
                        )}
                        {oc.podeEditar && (
                            <div className="flex gap-2.5">
                                <button onClick={() => onEditar(oc)}
                                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm min-h-[44px]">
                                    <Pencil className="h-4 w-4" /> Editar
                                </button>
                                <button onClick={() => onExcluir(oc)}
                                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-full font-semibold text-sm min-h-[44px]">
                                    <Trash2 className="h-4 w-4" /> Excluir
                                </button>
                            </div>
                        )}
                        {!oc.podeEditar && oc.criadaPeloAdmin && (
                            <p className="text-center text-[11px] text-gray-400">🔒 Tarefa do administrador — só ele pode editar ou excluir.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── card de tarefa (mobile / lista) ──
const CardTarefa = ({ oc, userId, onClick, mostrarResponsavel }) => {
    const origem = estiloOrigem(oc, userId);
    return (
        <button onClick={onClick} className="w-full text-left bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:border-primary/40 transition-colors min-h-[44px]">
            <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                    <span className={`shrink-0 w-2.5 h-2.5 rounded-full ${origem === 'admin' ? 'bg-house' : origem === 'colega' ? 'bg-amber-400' : 'bg-primary'}`} />
                    <span className={`font-semibold text-gray-900 truncate ${oc.status === 'CONCLUIDA' ? 'line-through text-gray-400' : ''}`}>
                        {oc.hora} · {oc.titulo}
                    </span>
                </div>
                <BadgeStatus oc={oc} />
            </div>
            <div className="text-sm text-gray-500 flex items-center gap-2 flex-wrap">
                {mostrarResponsavel && <span className="font-medium text-gray-600">{oc.responsavel?.nome}</span>}
                {oc.criadaPeloAdmin && <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Admin</span>}
                {!oc.criadaPeloAdmin && oc.criadoPor?.id !== userId && <span className="inline-flex items-center gap-1"><UserIcon className="h-3 w-3" /> {oc.criadoPor?.nome}</span>}
                {oc.recorrencia !== 'NUNCA' && <span className="inline-flex items-center gap-1"><Repeat className="h-3 w-3" /> {RECORRENCIA_LABEL[oc.recorrencia]}</span>}
                {oc.anexos?.length > 0 && <span>📎 {oc.anexos.length}</span>}
            </div>
        </button>
    );
};

const TarefasAgenda = () => {
    const { user, hasPermission } = useAuth();
    const isAdmin = !!user?.permissoes?.admin;
    const podeVerColegas = isAdmin || hasPermission('Pode_Ver_Agenda_Colegas');
    const podeParaOutros = isAdmin || hasPermission('Pode_Criar_Tarefas_Para_Outros');
    const podeParecer = isAdmin || hasPermission('Pode_Ver_Parecer_Tarefas');

    const [visao, setVisao] = useState(() => (window.innerWidth < 768 ? 'dia' : 'semana'));
    const [dataBase, setDataBase] = useState(hojeStr());
    const [vendedorSel, setVendedorSel] = useState('minha');
    const [ocorrencias, setOcorrencias] = useState([]);
    const [equipe, setEquipe] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [detalhe, setDetalhe] = useState(null);
    const [formAberto, setFormAberto] = useState(null); // {inicial} ou {tarefa}

    const { de, ate } = useMemo(() => {
        if (visao === 'semana') { const ini = inicioSemana(dataBase); return { de: ini, ate: addDias(ini, 6) }; }
        if (visao === 'dia') return { de: dataBase, ate: dataBase };
        return { de: dataBase, ate: addDias(dataBase, 29) }; // lista: 30 dias
    }, [visao, dataBase]);

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const vendedorId = vendedorSel === 'minha' ? undefined : vendedorSel;
            const { ocorrencias: ocs } = await tarefaService.agenda(de, ate, vendedorId);
            setOcorrencias(ocs);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao carregar a agenda.');
        } finally {
            setCarregando(false);
        }
    }, [de, ate, vendedorSel]);

    useEffect(() => { carregar(); }, [carregar]);

    useEffect(() => {
        tarefaService.equipe().then(setEquipe).catch(() => setEquipe([]));
    }, []);

    const pendentesAgora = useMemo(() => {
        const hoje = hojeStr(), agora = horaStr();
        return ocorrencias.filter(o =>
            o.responsavel?.id === user?.id && o.dataRef === hoje &&
            minutos(o.hora) <= minutos(agora) && o.status !== 'CONCLUIDA').length;
    }, [ocorrencias, user]);

    const navegar = (dir) => {
        const passo = visao === 'semana' ? 7 : 1;
        setDataBase(d => addDias(d, dir * passo));
    };

    const concluir = async (oc) => {
        try {
            await tarefaService.concluir(oc.id, oc.dataRef);
            toast.success('Tarefa concluída!');
            setDetalhe(null);
            carregar();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao concluir.');
        }
    };

    const excluir = async (oc) => {
        const aviso = oc.recorrencia !== 'NUNCA'
            ? 'Esta tarefa se repete. Excluir apaga TODAS as repetições. Confirma?'
            : 'Excluir esta tarefa?';
        if (!window.confirm(aviso)) return;
        try {
            await tarefaService.excluir(oc.id);
            toast.success('Tarefa excluída.');
            setDetalhe(null);
            carregar();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao excluir.');
        }
    };

    const abrirNova = (dataRef, hora) => setFormAberto({ inicial: { dataInicio: dataRef || hojeStr(), hora: hora || '08:00' } });
    const abrirEdicao = (oc) => { setDetalhe(null); setFormAberto({ tarefa: oc }); };

    const diasSemana = useMemo(() => Array.from({ length: 7 }, (_, i) => addDias(inicioSemana(dataBase), i)), [dataBase]);
    const porDia = useMemo(() => {
        const mapa = {};
        for (const o of ocorrencias) (mapa[o.dataRef] = mapa[o.dataRef] || []).push(o);
        return mapa;
    }, [ocorrencias]);

    const tituloPeriodo = useMemo(() => {
        if (visao === 'semana') {
            const d1 = fromStr(diasSemana[0]), d2 = fromStr(diasSemana[6]);
            return `${d1.getDate()} ${MES_LABEL[d1.getMonth()]} – ${d2.getDate()} ${MES_LABEL[d2.getMonth()]}`;
        }
        const d = fromStr(dataBase);
        return `${DIAS_LABEL[d.getDay()]}, ${d.getDate()} ${MES_LABEL[d.getMonth()]}`;
    }, [visao, dataBase, diasSemana]);

    return (
        <div className="max-w-full overflow-x-hidden -mx-4 sm:-mx-6 lg:-mx-8">
            {/* ── Topbar ── */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 md:p-6 bg-white border-b border-gray-200">
                <div className="flex items-center gap-2">
                    <div className="bg-mint p-1.5 md:p-2 rounded-lg">
                        <CalendarCheck className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                    </div>
                    <h1 className="text-base md:text-2xl font-bold text-gray-900">Tarefas da Equipe</h1>
                    {pendentesAgora > 0 && (
                        <span className="relative inline-flex items-center" title={`${pendentesAgora} tarefa(s) aguardando conclusão`}>
                            <Bell className="h-5 w-5 text-gray-400" />
                            <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] px-0.5 flex items-center justify-center">{pendentesAgora}</span>
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {podeParecer && (
                        <Link to="/tarefas/parecer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-xs md:text-sm min-h-[36px]">
                            <BarChart3 className="h-4 w-4" /> Parecer do dia
                        </Link>
                    )}
                    <button onClick={() => abrirNova(dataBase)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-xs md:text-sm min-h-[36px]">
                        <Plus className="h-4 w-4" /> Nova tarefa
                    </button>
                </div>
            </div>

            {/* ── Barra de navegação/filtros ── */}
            <div className="flex flex-wrap items-center gap-2 px-3 md:px-6 py-2.5 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-1">
                    <button onClick={() => navegar(-1)} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"><ChevronLeft className="h-4 w-4" /></button>
                    <button onClick={() => setDataBase(hojeStr())} className="px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-full text-gray-600 hover:border-primary hover:text-primary">Hoje</button>
                    <button onClick={() => navegar(1)} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"><ChevronRight className="h-4 w-4" /></button>
                    <span className="text-sm font-bold text-gray-800 ml-1 whitespace-nowrap">{tituloPeriodo}</span>
                </div>
                <div className="flex bg-gray-200/70 rounded-full p-0.5 text-xs font-semibold ml-auto">
                    {[['semana', 'Semana'], ['dia', 'Dia'], ['lista', 'Lista']].map(([v, l]) => (
                        <button key={v} onClick={() => setVisao(v)}
                            className={`px-3 py-1.5 rounded-full transition-colors ${visao === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'} ${v === 'semana' ? 'hidden md:block' : ''}`}>
                            {l}
                        </button>
                    ))}
                </div>
                {podeVerColegas && (
                    <SelectBusca value={vendedorSel} onChange={e => setVendedorSel(e.target.value)} className="w-full md:w-56">
                        <option value="minha">Minha agenda</option>
                        <option value="todos">Toda a equipe</option>
                        {equipe.filter(v => v.id !== user?.id).map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                    </SelectBusca>
                )}
            </div>

            {/* ── Conteúdo ── */}
            <div className="p-3 md:p-6">
                {carregando ? (
                    <div className="p-10 text-center text-gray-400 text-sm">Carregando agenda…</div>
                ) : visao === 'semana' ? (
                    /* ══ SEMANA (desktop) ══ */
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <div className="min-w-[820px]">
                                <div className="grid" style={{ gridTemplateColumns: '52px repeat(7, 1fr)' }}>
                                    <div />
                                    {diasSemana.map(d => {
                                        const dt = fromStr(d), ehHoje = d === hojeStr();
                                        return (
                                            <div key={d} className={`px-2 py-2 text-center border-l border-gray-100 ${ehHoje ? 'bg-mint/40' : ''}`}>
                                                <div className={`text-[10px] font-semibold uppercase ${ehHoje ? 'text-primaryDark' : 'text-gray-400'}`}>{DIAS_LABEL[dt.getDay()]}{ehHoje ? ' · hoje' : ''}</div>
                                                <div className={`text-sm font-bold ${ehHoje ? 'text-primaryDark' : 'text-gray-700'}`}>{p2(dt.getDate())}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="grid" style={{ gridTemplateColumns: '52px repeat(7, 1fr)' }}>
                                    <div>
                                        {Array.from({ length: HORA_FIM - HORA_INI + 1 }, (_, i) => (
                                            <div key={i} className="text-[10px] text-gray-400 text-right pr-2 pt-0.5 border-t border-gray-100" style={{ height: ALTURA_HORA }}>
                                                {p2(HORA_INI + i)}:00
                                            </div>
                                        ))}
                                    </div>
                                    {diasSemana.map(d => {
                                        const ehHoje = d === hojeStr();
                                        const doDia = (porDia[d] || []);
                                        return (
                                            <div key={d} className={`relative border-l border-gray-100 ${ehHoje ? 'bg-mint/10' : ''}`}>
                                                {Array.from({ length: HORA_FIM - HORA_INI + 1 }, (_, i) => (
                                                    <div key={i}
                                                        onClick={() => abrirNova(d, `${p2(HORA_INI + i)}:00`)}
                                                        className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                                                        style={{ height: ALTURA_HORA }}
                                                        title={`Nova tarefa ${fmtBR(d)} às ${p2(HORA_INI + i)}:00`} />
                                                ))}
                                                {doDia.map((oc, i) => {
                                                    const top = Math.max(0, (minutos(oc.hora) - HORA_INI * 60) / 60 * ALTURA_HORA);
                                                    const tocando = oc.dataRef === hojeStr() && minutos(oc.hora) <= minutos(horaStr()) && oc.status !== 'CONCLUIDA';
                                                    return (
                                                        <button key={`${oc.id}-${oc.dataRef}-${i}`}
                                                            onClick={() => setDetalhe(oc)}
                                                            className={`absolute left-1 right-1 rounded-lg px-2 py-1 text-left text-[11px] leading-tight overflow-hidden shadow-sm ${CORES_BLOCO[estiloOrigem(oc, user?.id)]} ${oc.status === 'CONCLUIDA' ? 'opacity-55' : ''} ${tocando ? 'animate-pulse' : ''}`}
                                                            style={{ top: top + 1, height: 40, willChange: tocando ? 'opacity' : undefined }}>
                                                            <span className={`font-bold block truncate ${oc.status === 'CONCLUIDA' ? 'line-through' : ''}`}>
                                                                {oc.criadaPeloAdmin && oc.criadoPor?.id !== user?.id ? '🔒 ' : ''}{oc.hora} · {oc.titulo}
                                                            </span>
                                                            <span className="block truncate opacity-80">
                                                                {vendedorSel === 'todos' ? oc.responsavel?.nome : (oc.status === 'CONCLUIDA' ? '✓ concluída' : tocando ? '⏰ tocando agora' : `por ${oc.criadoPor?.nome}`)}
                                                                {oc.anexos?.length > 0 ? ` · 📎${oc.anexos.length}` : ''}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                                {ehHoje && minutos(horaStr()) >= HORA_INI * 60 && minutos(horaStr()) <= (HORA_FIM + 1) * 60 && (
                                                    <div className="absolute left-0 right-0 flex items-center pointer-events-none" style={{ top: (minutos(horaStr()) - HORA_INI * 60) / 60 * ALTURA_HORA }}>
                                                        <div className="h-2 w-2 rounded-full bg-red-500 -ml-1" />
                                                        <div className="h-px flex-1 bg-red-500" />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        {/* legenda */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-600">
                            <span className="font-bold uppercase tracking-widest text-gray-500 text-[10px]">Legenda:</span>
                            <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-mint border border-primary/20 inline-block" /> Minha tarefa</span>
                            <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-house inline-block" /> 🔒 Do Admin (só ele edita)</span>
                            <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-white border-2 border-amber-400 inline-block" /> De um colega</span>
                            <span className="flex items-center gap-1.5">Piscando = tocando agora</span>
                        </div>
                    </div>
                ) : visao === 'dia' ? (
                    /* ══ DIA ══ */
                    <div className="space-y-3">
                        {(porDia[dataBase] || []).length === 0 ? (
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-sm text-gray-400">
                                Nenhuma tarefa neste dia.
                                <button onClick={() => abrirNova(dataBase)} className="block mx-auto mt-3 px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm">+ Criar tarefa</button>
                            </div>
                        ) : (
                            (porDia[dataBase] || []).map((oc, i) => (
                                <CardTarefa key={`${oc.id}-${i}`} oc={oc} userId={user?.id}
                                    mostrarResponsavel={vendedorSel !== 'minha'}
                                    onClick={() => setDetalhe(oc)} />
                            ))
                        )}
                    </div>
                ) : (
                    /* ══ LISTA (próximos 30 dias) ══ */
                    <div className="space-y-5">
                        {ocorrencias.length === 0 && (
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-sm text-gray-400">Nenhuma tarefa nos próximos 30 dias.</div>
                        )}
                        {Object.entries(porDia).sort(([a], [b]) => a.localeCompare(b)).map(([dia, ocs]) => (
                            <div key={dia}>
                                <div className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2 px-1">
                                    {DIAS_LABEL[fromStr(dia).getDay()]} · {fmtBR(dia)}{dia === hojeStr() ? ' (hoje)' : ''}
                                </div>
                                <div className="space-y-2">
                                    {ocs.map((oc, i) => (
                                        <CardTarefa key={`${oc.id}-${i}`} oc={oc} userId={user?.id}
                                            mostrarResponsavel={vendedorSel !== 'minha'}
                                            onClick={() => setDetalhe(oc)} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Modais ── */}
            {detalhe && (
                <TarefaDetalheModal oc={detalhe} usuario={user}
                    onClose={() => setDetalhe(null)}
                    onConcluir={concluir}
                    onEditar={abrirEdicao}
                    onExcluir={excluir} />
            )}
            {formAberto && (
                <TarefaFormModal
                    tarefa={formAberto.tarefa}
                    inicial={formAberto.inicial}
                    equipe={equipe}
                    podeParaOutros={podeParaOutros}
                    usuario={user}
                    onClose={() => setFormAberto(null)}
                    onSalvo={() => { setFormAberto(null); carregar(); }} />
            )}
        </div>
    );
};

export default TarefasAgenda;
