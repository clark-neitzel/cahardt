import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import appAuthService from '../services/appAuthService';
import api from '../services/api';
import { definirTokenMidia, limparTokenMidia } from '../utils/urlUpload';

const AuthContext = createContext();

const TENTATIVAS_SESSAO = 3;
const CHAVE_SNAPSHOT = '@HardtApp:userSnapshot';
// Telas que precisam abrir SEM internet (Separação de Carga dentro da câmara fria) usam o último usuário validado.
const ROTA_OFFLINE = '/separacao-carga';
const guardarSnapshot = (u) => { try { localStorage.setItem(CHAVE_SNAPSHOT, JSON.stringify(u)); } catch { /* sem localStorage */ } };
// Há separação em andamento NESTE aparelho para este usuário? (mesma chave de pages/Logistica/SeparacaoCarga/separacaoStorage.js)
const temSeparacaoEmAndamento = (userId) => {
    try { return !!JSON.parse(localStorage.getItem(`separacao_carga_v1:${userId}:ultima`) || 'null')?.embarqueId; } catch { return false; }
};
const lerSnapshot = () => { try { return JSON.parse(localStorage.getItem(CHAVE_SNAPSHOT) || 'null'); } catch { return null; } };
const RENOVAR_MIDIA_MS = 6 * 60 * 60 * 1000; // token vale 12h; renova com 6h

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    // Havia token salvo, mas não conseguimos falar com o servidor para validá-lo.
    // Diferente de "deslogado": o token continua guardado e é só tentar de novo.
    const [erroConexao, setErroConexao] = useState(false);

    // Token de mídia (?mt=) para abrir arquivos sensíveis em <img>/<a>. Falha aqui NUNCA
    // desloga nem trava o app: segue sem token e tenta de novo na próxima renovação.
    const usouSnapshot = useRef(false);
    // true = sem rede e usando o último usuário validado, SÓ para a Separação de Carga (PrivateRoute barra o resto)
    const [usandoSnapshot, setUsandoSnapshot] = useState(false);
    const midiaEmMs = useRef(0);
    const midiaBuscando = useRef(false);
    const buscarTokenMidia = useCallback(async () => {
        if (midiaBuscando.current) return;
        midiaBuscando.current = true;
        try {
            const { data } = await api.get('/auth/midia-token');
            if (data?.token) {
                definirTokenMidia(data.token);
                midiaEmMs.current = Date.now();
            }
        } catch (e) {
            console.warn('Token de mídia indisponível (segue sem):', e?.message);
        } finally {
            midiaBuscando.current = false;
        }
    }, []);

    const limparSessao = useCallback(() => {
        limparTokenMidia();
        midiaEmMs.current = 0;
        localStorage.removeItem('@HardtApp:token');
        try { localStorage.removeItem(CHAVE_SNAPSHOT); } catch { /* sem localStorage */ }
        delete api.defaults.headers.common['Authorization'];
        usouSnapshot.current = false;
        setUsandoSnapshot(false);
        setUser(null);
    }, []);

    // Valida a sessão salva ao abrir o app.
    //
    // CUIDADO: só apagar o token quando o servidor DISSER que ele não vale (401/403).
    // Antes, qualquer erro caía em logout() — então um blip de rede, um 500 ou um
    // deploy do backend em andamento apagavam o token e jogavam o usuário na tela
    // de login. Era a causa de "o app me desloga sozinho toda hora".
    const carregarUsuario = useCallback(async () => {
        const token = localStorage.getItem('@HardtApp:token');
        if (!token) {
            setErroConexao(false);
            setLoading(false);
            return;
        }

        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        setLoading(true);

        let ultimoErro = null;
        for (let tentativa = 1; tentativa <= TENTATIVAS_SESSAO; tentativa++) {
            try {
                const userData = await appAuthService.me();
                guardarSnapshot(userData);
                usouSnapshot.current = false;
                setUsandoSnapshot(false);
                setUser(userData);
                setErroConexao(false);
                setLoading(false);
                buscarTokenMidia(); // sem await: não atrasa a abertura
                return;
            } catch (error) {
                const status = error.response?.status;

                if (status === 401 || status === 403) {
                    console.error('Sessão expirada ou inválida:', error);
                    limparSessao();
                    setErroConexao(false);
                    setLoading(false);
                    return;
                }

                ultimoErro = error;
                console.warn(`Falha ao validar a sessão (tentativa ${tentativa}/${TENTATIVAS_SESSAO}):`, error?.message);
                // sem internet de verdade: não adianta esperar entre as tentativas
                if (tentativa < TENTATIVAS_SESSAO && navigator.onLine !== false) {
                    await new Promise((r) => setTimeout(r, 1200 * tentativa));
                }
            }
        }

        // Só a Separação de Carga abre sem rede (usa o último usuário validado). Vale para abrir direto nela OU pelo
        // ícone do app (que abre em "/"): com separação em andamento neste aparelho e permissão de separar, usa o
        // snapshot (RootRoute leva para /separacao-carga). Qualquer outra rota continua caindo na TelaSemConexao;
        // 401/403 já deslogou acima.
        const snapshot = lerSnapshot();
        const caminho = window.location.pathname;
        const caminhoOk = usouSnapshot.current || caminho.startsWith(ROTA_OFFLINE) || caminho === '/';
        const podeSeparar = !!(snapshot?.permissoes?.admin || snapshot?.permissoes?.Pode_Separar_Carga === true);
        // Só vale quando o servidor NÃO respondeu (rede caída/timeout). 5xx/502/503 (deploy) = TelaSemConexao como sempre.
        const semResposta = !ultimoErro?.response;
        if (semResposta && snapshot?.id && caminhoOk && podeSeparar && temSeparacaoEmAndamento(snapshot.id)) {
            usouSnapshot.current = true;
            setUsandoSnapshot(true);
            setUser(snapshot);
            setErroConexao(false);
            setLoading(false);
            return;
        }

        // Rede/servidor fora: mantém o token e mostra a tela de "tentar novamente".
        setErroConexao(true);
        setLoading(false);
    }, [limparSessao, buscarTokenMidia]);

    useEffect(() => {
        carregarUsuario();
    }, [carregarUsuario]);

    // Renovação: a cada 6h com o app aberto e ao voltar ao primeiro plano se já passou de 6h
    // (ou se nunca conseguiu o token).
    useEffect(() => {
        if (!user) return undefined;
        const precisa = () => !midiaEmMs.current || Date.now() - midiaEmMs.current >= RENOVAR_MIDIA_MS;
        const intervalo = setInterval(() => { if (precisa()) buscarTokenMidia(); }, 10 * 60 * 1000);
        const aoVoltar = () => { if (document.visibilityState === 'visible' && precisa()) buscarTokenMidia(); };
        document.addEventListener('visibilitychange', aoVoltar);
        return () => { clearInterval(intervalo); document.removeEventListener('visibilitychange', aoVoltar); };
    }, [user, buscarTokenMidia]);

    // Abriu sem rede com o usuário guardado: confirma em SILÊNCIO (sem setLoading, senão o PrivateRoute desmontaria
    // a tela no meio do envio) quando o sinal volta (evento online), ao voltar para o app e a cada ~30 s —
    // Wi-Fi sem saída não dispara 'online'. 401/403 = sessão inválida → desloga. Sai do snapshot ao conseguir.
    useEffect(() => {
        if (!usandoSnapshot) return undefined;
        let ocupado = false;
        const revalidar = async () => {
            if (ocupado || !usouSnapshot.current || !localStorage.getItem('@HardtApp:token')) return;
            ocupado = true;
            try {
                const userData = await appAuthService.me();
                usouSnapshot.current = false;
                setUsandoSnapshot(false);
                guardarSnapshot(userData);
                setUser(userData);
                buscarTokenMidia();
            } catch (error) {
                const status = error.response?.status;
                if (status === 401 || status === 403) limparSessao();
            } finally {
                ocupado = false;
            }
        };
        const aoVisivel = () => { if (document.visibilityState === 'visible') revalidar(); };
        const timer = setInterval(revalidar, 30 * 1000);
        window.addEventListener('online', revalidar);
        document.addEventListener('visibilitychange', aoVisivel);
        return () => {
            clearInterval(timer);
            window.removeEventListener('online', revalidar);
            document.removeEventListener('visibilitychange', aoVisivel);
        };
    }, [usandoSnapshot, limparSessao, buscarTokenMidia]);

    const login = async (loginSTR, senhaSTR) => {
        try {
            const { token, user } = await appAuthService.login(loginSTR, senhaSTR);
            localStorage.setItem('@HardtApp:token', token);
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            guardarSnapshot(user);
            setUser(user);
            setErroConexao(false);
            buscarTokenMidia();
            return { success: true };
        } catch (error) {
            console.error(error);
            let msg = error.response?.data?.error;
            if (!msg) {
                msg = error.code === 'ERR_NETWORK'
                    ? 'Erro de conexão com o servidor. Verifique sua internet.'
                    : error.message || 'Erro ao fazer login';
            }
            return { success: false, error: msg };
        }
    };

    const logout = () => {
        limparSessao();
        setErroConexao(false);
    };

    const refreshUser = async () => {
        try {
            const userData = await appAuthService.me();
            setUser(userData);
        } catch (error) {
            console.error('Erro ao atualizar dados do usuário:', error);
        }
    };

    const hasPermission = (tab, action = 'view') => {
        if (!user || !user.permissoes) return false;
        if (user.permissoes.admin) return true;

        // Se a permissao for boolean direto (novas tags logisticas), responde ela.
        if (typeof user.permissoes[tab] === 'boolean') {
            return user.permissoes[tab] === true;
        }

        const perm = user.permissoes[tab];
        if (!perm) return false;

        if (action === 'view') return !!perm.view;
        if (action === 'edit') return !!perm.edit;
        if (action === 'clientes') return perm.clientes || 'vinculados';
        return false;
    };

    return (
        <AuthContext.Provider value={{ user, signed: !!user, loading, erroConexao, usandoSnapshot, login, logout, hasPermission, refreshUser, tentarNovamente: carregarUsuario }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
