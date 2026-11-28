import { useCallback, useEffect, useMemo, useState } from 'react';

// Novidades do sistema (frontend/public/novidades.json, mais recente primeiro). Compartilhado pelo Luke.
// A chave `clippy_novidade_vista` NÃO foi renomeada de propósito: está gravada nos aparelhos e, se mudasse,
// todo mundo veria de novo as novidades antigas. Guarda o slug da ÚLTIMA novidade que a pessoa já viu.
export const CHAVE_NOVIDADE_VISTA = 'clippy_novidade_vista';

const lerVista = () => { try { return localStorage.getItem(CHAVE_NOVIDADE_VISTA) || ''; } catch { return ''; } };

// `ehAdmin`: entrada do novidades.json com `"soAdmin": true` só aparece (e só faz o cachorro balançar) para administrador.
// Entrada sem o campo vale para todos.
export function useNovidades(ativo = true, ehAdmin = false) {
    const [todas, setTodas] = useState([]);
    const [vista, setVista] = useState(lerVista);

    useEffect(() => {
        if (!ativo) return undefined;
        let vivo = true;
        fetch('/novidades.json', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : []))
            .then((lista) => { if (vivo && Array.isArray(lista)) setTodas(lista.filter((n) => n && typeof n.slug === 'string')); })
            .catch(() => { /* sem manifesto, o Luke segue normal */ });
        return () => { vivo = false; };
    }, [ativo]);

    const novidades = useMemo(() => todas.filter((n) => n.soAdmin !== true || ehAdmin === true), [todas, ehAdmin]);
    const ultima = novidades[0] || null;
    // Quantas novidades a pessoa ainda não viu: as que estão acima da última vista na lista. Se a última vista
    // não está mais na lista (ou nunca viu nada), conta só a mais recente — como o Clippy sempre fez (não despeja 50 avisos).
    const idxVista = vista ? novidades.findIndex((n) => n.slug === vista) : -1;
    const qtdNovas = !ultima ? 0 : (idxVista === -1 ? 1 : idxVista);
    const temNovidade = qtdNovas > 0;
    const ehNova = (slug) => {
        const i = novidades.findIndex((n) => n.slug === slug);
        return i !== -1 && i < qtdNovas;
    };

    // Marca TUDO como visto (grava o slug da mais recente).
    const marcarVistas = useCallback(() => {
        if (!ultima) return;
        try { localStorage.setItem(CHAVE_NOVIDADE_VISTA, ultima.slug); } catch { /* ignora */ }
        setVista(ultima.slug);
    }, [ultima]);

    return { novidades, ultima, qtdNovas, temNovidade, ehNova, marcarVistas };
}
