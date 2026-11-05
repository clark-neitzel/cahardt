import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarDays, Loader2, Save, CheckCircle2, AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';

// Configurações → Agenda Google (/config/agenda-google).
// Editar: admin || configuracoes === true || configuracoes.edit === true (espelha o backend).
// Permissão é OBJETO — nunca `!!perms.configuracoes`.

const CARD = 'bg-white rounded-xl border border-gray-200 shadow-sm';
const TIT = 'text-xs font-bold uppercase tracking-widest text-gray-600';
const CAMPO = 'w-full min-h-[44px] border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none disabled:bg-gray-50 disabled:text-gray-600';
const btnPrim = 'px-4 py-2 min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-1.5';
const btnSec = 'px-4 py-2 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm disabled:opacity-50 inline-flex items-center justify-center gap-1.5';

const podeEditarGcal = (user) => {
    const p = user?.permissoes || {};
    const c = p.configuracoes;
    return p.admin === true || user?.isAdmin === true || c === true || (c && typeof c === 'object' && c.edit === true);
};

export const GCAL_REDIRECT_PATH = '/google-oauth-callback';
const GCAL_STATE_KEY = 'gcal_oauth_state';

const MOTIVOS = {
    google_nao_configurado: 'O Google ainda não foi conectado. Clique em "Reautorizar Google" e entre com a conta dona da agenda.',
    sem_calendar_id: 'Falta informar o ID da agenda. Preencha o campo abaixo e salve.',
    agenda_nao_encontrada: 'Não achamos uma agenda com esse ID. Confira o ID abaixo (ou se a conta conectada tem acesso a ela).',
    sem_permissao_calendar: 'O Google ainda não autorizou o acesso à agenda. Clique em Reautorizar.',
    sem_web_client: 'Configuração pendente no servidor: falta a credencial do Google. Avise o suporte técnico.',
};

export default function AgendaGoogle() {
    const { user } = useAuth();
    const editar = podeEditarGcal(user);

    const [calendarId, setCalendarId] = useState('');
    const [podeEditarSrv, setPodeEditarSrv] = useState(null);
    const [status, setStatus] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [autorizando, setAutorizando] = useState(false);
    const [sincronizando, setSincronizando] = useState(false);
    const [resultado, setResultado] = useState(null);
    const [enviados, setEnviados] = useState(0);

    const podeMexer = editar && podeEditarSrv !== false;

    const carregarStatus = useCallback(async () => {
        try {
            const r = await api.get('/config-gcal/status');
            setStatus(r.data);
        } catch (e) {
            setStatus(e.response?.status === 403 ? null : { conectado: false, motivo: 'erro_consulta' });
        }
    }, []);

    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const r = await api.get('/config-gcal');
                if (!vivo) return;
                setCalendarId(r.data?.calendarId || '');
                setPodeEditarSrv(r.data?.podeEditar ?? null);
            } catch (e) {
                // 403 = sem permissão: o aviso amarelo único já explica; só mostra erro real
                if (vivo && e.response?.status !== 403) setErro(e.response?.data?.error || 'Não foi possível carregar a configuração.');
            }
            await carregarStatus();
            if (vivo) setCarregando(false);
        })();
        return () => { vivo = false; };
    }, [carregarStatus]);

    const salvar = async () => {
        setSalvando(true);
        try {
            const r = await api.put('/config-gcal', { calendarId: calendarId.trim() });
            setCalendarId(r.data?.calendarId ?? calendarId.trim());
            toast.success('ID da agenda salvo.');
            await carregarStatus();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Não foi possível salvar.');
        } finally { setSalvando(false); }
    };

    const reautorizar = async () => {
        setAutorizando(true);
        try {
            const redirectUri = window.location.origin + GCAL_REDIRECT_PATH;
            const state = (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`);
            try { sessionStorage.setItem(GCAL_STATE_KEY, state); } catch { /* sem storage: o callback vai recusar */ }
            const r = await api.get('/config-gcal/auth-url', { params: { redirectUri, state } });
            if (!r.data?.url) throw new Error('sem url');
            window.location.href = r.data.url;   // mesma janela (PWA) — nunca window.open
        } catch (e) {
            toast.error(e.response?.data?.error || 'Não foi possível iniciar a autorização do Google.');
            setAutorizando(false);
        }
    };

    const sincronizar = async () => {
        setSincronizando(true);
        setResultado(null);
        setEnviados(0);
        const tot = { criados: 0, jaExistiam: 0, removidos: 0, erros: 0, errosLista: [] };
        let falhouHttp = false;
        try {
            // O servidor processa em lotes (até 50 por chamada); repete até não sobrar nada.
            for (let i = 0; i < 40; i++) {
                const r = await api.post('/config-gcal/sincronizar', {}, { timeout: 300000 });
                const d = r.data || {};
                tot.criados += Number(d.criados) || 0;
                tot.jaExistiam += Number(d.jaExistiam) || 0;
                tot.removidos += Number(d.removidos) || 0;
                tot.erros += Number(d.erros) || 0;
                if (Array.isArray(d.errosLista)) tot.errosLista.push(...d.errosLista);
                setEnviados(tot.criados);
                setResultado({ ...tot, errosLista: [...tot.errosLista] });
                if (!(Number(d.restantes) > 0)) break;
            }
            toast.success('Sincronização concluída.');
        } catch (e) {
            falhouHttp = true;
            toast.error(e.response?.data?.error || 'A sincronização falhou. Tente novamente.');
        } finally {
            if (falhouHttp && (tot.criados || tot.jaExistiam || tot.removidos || tot.erros)) setResultado({ ...tot, errosLista: [...tot.errosLista] });
            setSincronizando(false);
        }
    };

    const conectado = status?.conectado === true;
    const motivoTxt = status && !conectado
        ? (MOTIVOS[status.motivo] || 'Não foi possível verificar a agenda agora. Tente novamente em instantes.')
        : '';
    const errosLista = Array.isArray(resultado?.errosLista) ? resultado.errosLista : [];

    return (
        <div className="p-3 md:p-6 max-w-3xl mx-auto space-y-4 max-w-full overflow-x-hidden">
            <div className="flex items-center gap-2 min-w-0">
                <div className="bg-mint p-1.5 md:p-2 rounded-lg"><CalendarDays className="h-4 w-4 md:h-5 md:w-5 text-primaryDark" /></div>
                <div className="min-w-0">
                    <h1 className="text-lg md:text-2xl font-bold text-gray-900 truncate">Agenda Google</h1>
                    <p className="text-xs md:text-sm text-gray-600">Configurações · Kit Festa e Amostras na agenda “Produção”</p>
                </div>
            </div>

            {erro && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{erro}</div>}
            {!editar && !carregando && (
                <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">Você pode ver esta tela, mas não tem permissão para alterar.</div>
            )}

            <div className={CARD}>
                <div className="flex items-center gap-2 px-4 md:px-5 py-3.5 border-b border-gray-100">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <span className={TIT}>Situação da conexão</span>
                </div>
                <div className="p-4 md:p-5">
                    {carregando ? (
                        <p className="text-sm text-gray-600 inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Verificando…</p>
                    ) : conectado ? (
                        <div className="flex items-start gap-2">
                            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Conectado</span>
                                <p className="text-sm text-gray-700 mt-2 break-words">Agenda: <strong>{status.agenda || 'Produção'}</strong></p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">Não conectado</span>
                                <p className="text-sm text-gray-700 mt-2 break-words">{motivoTxt}</p>
                            </div>
                        </div>
                    )}
                    <div className="mt-4 flex flex-col sm:flex-row gap-2">
                        <button type="button" onClick={reautorizar} disabled={!podeMexer || autorizando} className={btnPrim}>
                            {autorizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Reautorizar Google
                        </button>
                        <button type="button" onClick={carregarStatus} disabled={carregando} className={btnSec}>
                            <RefreshCw className="h-4 w-4" /> Verificar de novo
                        </button>
                    </div>
                </div>
            </div>

            <div className={CARD}>
                <div className="flex items-center gap-2 px-4 md:px-5 py-3.5 border-b border-gray-100">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    <span className={TIT}>ID da agenda</span>
                </div>
                <div className="p-4 md:p-5 space-y-3">
                    <input
                        type="text"
                        value={calendarId}
                        onChange={(e) => setCalendarId(e.target.value)}
                        disabled={!podeMexer || carregando}
                        placeholder="exemplo: abc123@group.calendar.google.com"
                        className={CAMPO}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                    />
                    <p className="text-xs md:text-sm text-gray-600">
                        Onde achar: no Google Agenda, abra as <strong>Configurações da agenda “Produção”</strong> → <strong>Integrar agenda</strong> → copie o <strong>ID da agenda</strong>.
                    </p>
                    <button type="button" onClick={salvar} disabled={!podeMexer || salvando || carregando} className={`${btnPrim} w-full sm:w-auto`}>
                        {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
                    </button>
                </div>
            </div>

            <div className={CARD}>
                <div className="flex items-center gap-2 px-4 md:px-5 py-3.5 border-b border-gray-100">
                    <RefreshCw className="h-4 w-4 text-primary" />
                    <span className={TIT}>Sincronizar</span>
                </div>
                <div className="p-4 md:p-5 space-y-3">
                    <p className="text-xs md:text-sm text-gray-600">Envia para a agenda os Kit Festa, amostras e pedidos de entrega que ainda não estão nela. Pode demorar alguns instantes — não feche a tela.</p>
                    <button type="button" onClick={sincronizar} disabled={!podeMexer || sincronizando || !conectado} className={`${btnPrim} w-full sm:w-auto`}>
                        {sincronizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        {sincronizando ? `Sincronizando… ${enviados} enviados` : 'Sincronizar agenda agora'}
                    </button>
                    {!conectado && !carregando && <p className="text-xs text-gray-600">Conecte o Google e salve o ID da agenda para liberar este botão.</p>}
                    {resultado && (
                        <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                            <div className={`grid ${resultado.removidos > 0 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-3'} gap-2 text-center`}>
                                <div><p className="text-xl font-extrabold text-green-700">{resultado.criados ?? 0}</p><p className="text-xs text-gray-600">criados</p></div>
                                <div><p className="text-xl font-extrabold text-gray-900">{resultado.jaExistiam ?? 0}</p><p className="text-xs text-gray-600">já existiam</p></div>
                                {resultado.removidos > 0 && <div><p className="text-xl font-extrabold text-gray-900">{resultado.removidos}</p><p className="text-xs text-gray-600">removidos</p></div>}
                                <div><p className={`text-xl font-extrabold ${(resultado.erros ?? 0) > 0 ? 'text-red-700' : 'text-gray-900'}`}>{resultado.erros ?? 0}</p><p className="text-xs text-gray-600">com erro</p></div>
                            </div>
                            {errosLista.length > 0 && (
                                <ul className="text-xs text-red-700 space-y-1 list-disc pl-4 break-words">
                                    {errosLista.map((e, i) => <li key={i}>{typeof e === 'string' ? e : JSON.stringify(e)}</li>)}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
