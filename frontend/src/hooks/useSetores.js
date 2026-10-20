import { useCallback, useEffect, useState } from 'react';
import setorService, { capitalizarCodigo } from '../services/setorService';

// Lista de setores vinda do servidor (só ativos) — SÓ para telas com login (RH).
// Tablet/Como Fazer leem os setores de /home, /me e /tablet/:slug/funcionarios.
// Nunca volta à lista fixa: se falhar, nomeDe() devolve o código com inicial maiúscula.

let cache = null;          // { setores }
let promessa = null;
let geracao = 0; // sobe a cada invalidarSetores(): resposta de fetch antigo é descartada
const ouvintes = new Set();

export function invalidarSetores() {
    cache = null; promessa = null; geracao += 1;
    ouvintes.forEach((fn) => fn());
}

function buscar() {
    if (cache) return Promise.resolve(cache);
    if (!promessa) {
        const minha = geracao;
        promessa = setorService.listar()
            .then((d) => {
                if (minha !== geracao) return buscar(); // invalidado no meio do caminho: busca de novo
                const lista = (Array.isArray(d.setores) ? d.setores : [])
                    .filter((s) => s && s.codigo && s.ativo !== false)
                    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
                cache = { setores: lista };
                return cache;
            })
            .catch((e) => { if (minha === geracao) promessa = null; throw e; });
    }
    return promessa;
}

export function useSetores() {
    const [estado, setEstado] = useState({ setores: cache?.setores || [], carregando: !cache, erro: false });
    const [tick, setTick] = useState(0);

    useEffect(() => {
        const fn = () => setTick((t) => t + 1);
        ouvintes.add(fn);
        return () => { ouvintes.delete(fn); };
    }, []);

    useEffect(() => {
        let vivo = true;
        if (!cache) setEstado((e) => ({ ...e, carregando: true }));
        buscar()
            .then((c) => { if (vivo) setEstado({ setores: c.setores, carregando: false, erro: false }); })
            .catch(() => { if (vivo) setEstado({ setores: [], carregando: false, erro: true }); });
        return () => { vivo = false; };
    }, [tick]);

    const nomeDe = useCallback((codigo) => estado.setores.find((s) => s.codigo === codigo)?.nome || capitalizarCodigo(codigo), [estado.setores]);
    const iconeDe = useCallback((codigo) => estado.setores.find((s) => s.codigo === codigo)?.icone || '', [estado.setores]);

    return { ...estado, aviso: estado.erro || (!estado.carregando && estado.setores.length === 0), nomeDe, iconeDe };
}

export default useSetores;

/**
 * Opções {codigo, nome} para dropdown/multiselect. Códigos já gravados no registro e que não estão
 * mais na lista ativa (setor desativado) entram como "Nome (desativado)" — nunca somem em silêncio.
 * Devolve ARRAY (nunca Fragment).
 */
export function opcoesSetores(setores, atuais = [], comIcone = false, marcarDesativado = true) {
    const lista = (setores || []).map((s) => ({ codigo: s.codigo, nome: comIcone && s.icone ? `${s.icone} ${s.nome}` : s.nome }));
    const vistos = new Set(lista.map((o) => o.codigo));
    (Array.isArray(atuais) ? atuais : [atuais]).filter(Boolean).forEach((c) => {
        if (!vistos.has(c)) { vistos.add(c); lista.push({ codigo: c, nome: marcarDesativado ? `${capitalizarCodigo(c)} (desativado)` : capitalizarCodigo(c) }); }
    });
    return lista;
}
