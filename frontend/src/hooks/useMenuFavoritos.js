import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export const MENU_FAVORITOS_LIMITE = 10;

/**
 * Telas favoritas do menu (máx. 10), salvas por usuário no backend
 * (app_configs) para valerem em qualquer aparelho. O localStorage é só
 * cache para o menu abrir já com os favoritos, sem esperar a API.
 *
 * toggle(to) → true se aplicou; false se estourou o limite (mostrar aviso).
 */
export function useMenuFavoritos(userId) {
    const storageKey = `menu-favoritos:${userId || 'anon'}`;

    const [favoritos, setFavoritos] = useState(() => {
        try {
            const salvo = JSON.parse(localStorage.getItem(storageKey));
            return Array.isArray(salvo) ? salvo : [];
        } catch {
            return [];
        }
    });

    useEffect(() => {
        if (!userId) return;
        let ativo = true;
        api.get('/auth/menu-favoritos')
            .then(({ data }) => {
                if (!ativo || !Array.isArray(data?.favoritos)) return;
                setFavoritos(data.favoritos);
                localStorage.setItem(storageKey, JSON.stringify(data.favoritos));
            })
            .catch(() => { /* offline/erro: segue com o cache local */ });
        return () => { ativo = false; };
    }, [userId, storageKey]);

    const toggle = useCallback((to) => {
        const jaTem = favoritos.includes(to);
        if (!jaTem && favoritos.length >= MENU_FAVORITOS_LIMITE) return false;
        const novos = jaTem ? favoritos.filter(f => f !== to) : [...favoritos, to];
        setFavoritos(novos);
        localStorage.setItem(storageKey, JSON.stringify(novos));
        api.put('/auth/menu-favoritos', { favoritos: novos }).catch(() => {});
        return true;
    }, [favoritos, storageKey]);

    return { favoritos, toggle, limite: MENU_FAVORITOS_LIMITE };
}
