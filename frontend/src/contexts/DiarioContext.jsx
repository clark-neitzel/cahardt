import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

const DiarioContext = createContext();

export const DiarioProvider = ({ children }) => {
    const { user, signed } = useAuth();
    const [diarioStatus, setDiarioStatus] = useState({
        loading: true,
        hojeStatus: 'nao_iniciado', // ou 'iniciado'
        pendenciaAnterior: false,
        diarioHoje: null,
        diarioPendente: null
    });

    const carregarStatus = async () => {
        if (!signed || !user?.vendedorId) {
            setDiarioStatus(prev => ({ ...prev, loading: false }));
            return;
        }

        try {
            const { data } = await api.get('/diarios/status');
            setDiarioStatus({
                loading: false,
                ...data
            });
        } catch (error) {
            console.error('Erro ao carregar o status do Diário:', error);
            setDiarioStatus(prev => ({ ...prev, loading: false }));
        }
    };

    useEffect(() => {
        carregarStatus();
    }, [signed, user]);

    return (
        <DiarioContext.Provider value={{ diarioStatus, carregarStatus }}>
            {children}
        </DiarioContext.Provider>
    );
};

export const useDiario = () => {
    return useContext(DiarioContext);
};
