import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import api from '../../services/api';

// Retorno do Google (OAuth) — /google-oauth-callback?code=... ou ?error=...
// Rota protegida: se a sessão estiver aberta, segue direto. O `code` só vale uma vez,
// por isso o ref impede a troca dupla (StrictMode / re-render).

const CARD = 'bg-white rounded-xl border border-gray-200 shadow-sm';
const btnPrim = 'px-4 py-2 min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm inline-flex items-center justify-center gap-1.5';

export default function GoogleOAuthCallback() {
    const [estado, setEstado] = useState('carregando'); // carregando | ok | erro
    const [msg, setMsg] = useState('');
    const [sincronizando, setSincronizando] = useState(false);
    const feito = useRef(false);

    useEffect(() => {
        if (feito.current) return;
        feito.current = true;
        const qs = new URLSearchParams(window.location.search);
        const erroGoogle = qs.get('error');
        const code = qs.get('code');
        if (erroGoogle) {
            setMsg(erroGoogle === 'access_denied' ? 'A autorização foi negada no Google. Nada foi alterado.' : `O Google devolveu um erro: ${erroGoogle}`);
            setEstado('erro');
            return;
        }
        let esperado = null;
        try { esperado = sessionStorage.getItem('gcal_oauth_state'); sessionStorage.removeItem('gcal_oauth_state'); } catch { /* ignora */ }
        const recebido = qs.get('state');
        if (!erroGoogle && code && (!esperado || !recebido || esperado !== recebido)) {
            setMsg('Autorização inválida. Recomece pela tela de configuração.');
            setEstado('erro');
            return;
        }
        if (!code) {
            setMsg('O Google não enviou o código de autorização. Volte e tente reautorizar.');
            setEstado('erro');
            return;
        }
        (async () => {
            try {
                const r = await api.post('/config-gcal/auth-code', { code, redirectUri: window.location.origin + '/google-oauth-callback' });
                setSincronizando(r.data?.sincronizandoExistentes === true);
                setEstado('ok');
            } catch (e) {
                setMsg(e.response?.data?.error || 'Não foi possível concluir a conexão com o Google.');
                setEstado('erro');
            }
        })();
    }, []);

    return (
        <div className="p-3 md:p-6 max-w-lg mx-auto space-y-4 max-w-full overflow-x-hidden">
            <div className="flex items-center gap-2">
                <div className="bg-mint p-1.5 md:p-2 rounded-lg"><CalendarDays className="h-4 w-4 md:h-5 md:w-5 text-primaryDark" /></div>
                <h1 className="text-lg md:text-2xl font-bold text-gray-900">Agenda Google</h1>
            </div>
            <div className={`${CARD} p-5 text-center space-y-3`}>
                {estado === 'carregando' && (
                    <p className="text-sm text-gray-700 inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Concluindo a conexão com o Google…</p>
                )}
                {estado === 'ok' && (
                    <>
                        <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto" />
                        <p className="text-base font-bold text-gray-900">Google conectado</p>
                        {sincronizando && <p className="text-sm text-gray-700">Os pedidos existentes estão sendo enviados para a agenda. Isso roda em segundo plano.</p>}
                    </>
                )}
                {estado === 'erro' && (
                    <>
                        <AlertTriangle className="h-10 w-10 text-red-600 mx-auto" />
                        <p className="text-base font-bold text-gray-900">Não foi possível conectar</p>
                        <p className="text-sm text-gray-700 break-words">{msg}</p>
                    </>
                )}
                {estado !== 'carregando' && (
                    <Link to="/config/agenda-google" className={`${btnPrim} w-full sm:w-auto`}>Voltar para a configuração</Link>
                )}
            </div>
        </div>
    );
}
