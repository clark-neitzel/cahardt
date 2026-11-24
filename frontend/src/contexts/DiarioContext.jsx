import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';
import dataLocalHoje from '../utils/dataLocal';
import { ehRotaOffline } from '../utils/rotasOffline';

const DiarioContext = createContext();

const TTL_REVALIDACAO_MS = 5 * 60 * 1000; // não rebusca em background mais que 1x/5min (banco compartilhado lento no pico); virada de data ignora o TTL

export const DiarioProvider = ({ children }) => {
    const { user, signed, ehExterno } = useAuth();
    const [diarioStatus, setDiarioStatus] = useState({
        loading: true,
        hojeStatus: 'nao_iniciado', // ou 'iniciado'
        pendenciaAnterior: false,
        diarioHoje: null,
        diarioPendente: null,
        falhaRede: false // a última consulta falhou por REDE (sem resposta do servidor)
    });

    const carregarStatus = useCallback(async () => {
        if (!signed || !user?.id) {
            setDiarioStatus(prev => ({ ...prev, loading: false }));
            return;
        }
        // Externo (contador) não tem diário: o servidor barra /diarios/status.
        if (ehExterno) {
            setDiarioStatus(prev => ({ ...prev, loading: false }));
            return;
        }

        // Prazo curto SÓ na Separação de Carga (câmara fria sem sinal). Em qualquer outra tela a chamada é igual
        // à de sempre (sem prazo): banco lento não pode fazer o modal do ponto aparecer para quem já iniciou o dia.
        const naSeparacao = ehRotaOffline(window.location.pathname);
        try {
            const { data } = await api.get('/diarios/status', naSeparacao ? { timeout: 15000 } : undefined);
            setDiarioStatus({
                loading: false,
                falhaRede: false,
                ...data
            });
        } catch (error) {
            console.error('Erro ao carregar o status do Diário:', error);
            setDiarioStatus(prev => naSeparacao
                ? { ...prev, loading: false, falhaRede: !error?.response }
                : { ...prev, loading: false });
        }
    }, [signed, user, ehExterno]);

    useEffect(() => {
        carregarStatus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signed, user?.id]);

    // Rebusca o status ao voltar para o app (visibilitychange/focus — o PWA fica
    // dias abertos no celular), respeitando o TTL de 5 min, e SEMPRE que a data
    // local virar — aí ignora o TTL e rebusca na hora (checa a cada 30s mesmo com
    // o app em primeiro plano o dia inteiro), para o DiarioGateway pedir o início
    // do novo dia em vez de continuar achando que "hoje" já foi iniciado.
    useEffect(() => {
        if (!signed || !user?.id || ehExterno) return;
        let ultimaChamada = 0;
        let ultimaData = dataLocalHoje();
        const revisar = () => {
            if (document.visibilityState !== 'visible') return;
            const hoje = dataLocalHoje();
            const mudouData = hoje !== ultimaData;
            const passouTtl = Date.now() - ultimaChamada >= TTL_REVALIDACAO_MS;
            if (mudouData || passouTtl) {
                ultimaData = hoje;
                ultimaChamada = Date.now();
                carregarStatus();
            }
        };
        document.addEventListener('visibilitychange', revisar);
        window.addEventListener('focus', revisar);
        const timer = setInterval(revisar, 30 * 1000);
        return () => {
            document.removeEventListener('visibilitychange', revisar);
            window.removeEventListener('focus', revisar);
            clearInterval(timer);
        };
    }, [signed, user, ehExterno, carregarStatus]);

    return (
        <DiarioContext.Provider value={{ diarioStatus, carregarStatus }}>
            {children}
        </DiarioContext.Provider>
    );
};

export const useDiario = () => {
    return useContext(DiarioContext);
};
