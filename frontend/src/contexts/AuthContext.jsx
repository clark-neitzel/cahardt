import React, { createContext, useContext, useState, useEffect } from 'react';
import appAuthService from '../services/appAuthService';
import api from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadUser = async () => {
            const token = localStorage.getItem('@HardtApp:token');
            if (token) {
                api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
                try {
                    const userData = await appAuthService.me();
                    setUser(userData);
                } catch (error) {
                    console.error("Token inválido ou expirado:", error);
                    logout();
                }
            }
            setLoading(false);
        };

        loadUser();
    }, []);

    const login = async (loginSTR, senhaSTR) => {
        try {
            const { token, user } = await appAuthService.login(loginSTR, senhaSTR);
            localStorage.setItem('@HardtApp:token', token);
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            setUser(user);
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
        localStorage.removeItem('@HardtApp:token');
        delete api.defaults.headers.common['Authorization'];
        setUser(null);
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
        <AuthContext.Provider value={{ user, signed: !!user, loading, login, logout, hasPermission, refreshUser }}>
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
