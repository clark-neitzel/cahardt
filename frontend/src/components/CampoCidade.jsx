import React, { useEffect, useState } from 'react';
import ComboBusca from './ComboBusca';
import api from '../services/api';
import { normalizarCidade } from '../utils/cidade';

// Campo CIDADE dos cadastros (cliente e lead) — Fase 4 da padronização de cidades.
//
// Por que não é um <input> livre: a mesma cidade vivia no banco em várias grafias
// ("Itapoá" / "ITAPOA" / "itapoa "), e quem casa cidade (meta, comissão, dashboards)
// faz lookup exato — a meta em "Itapoá" não via os pedidos de "ITAPOA".
//
// Como funciona:
//   · lista as cidades já existentes (clientes e leads); escolher da lista grava a
//     grafia EXATA que já está no banco (busca sem acento/caixa: "itapoa" acha "Itapoá");
//   · o que não existe pode ser digitado ("Usar “X”") e passa por `normalizarCidade`
//     (Title Case pt-BR mantendo os acentos digitados) antes de ir para o form;
//   · se a lista não carregar (sem permissão / sem rede) o campo continua funcionando
//     como texto livre — nunca trava o cadastro.
//
// API: value (string), onChange(string). Sem e.target — quem usa handler compartilhado
// com e.target.name deve embrulhar: onChange={v => set('End_Cidade', v)}.

// Cache por 5 min: a lista muda pouco, mas uma cidade nova salva num cadastro precisa
// aparecer na próxima abertura sem exigir recarregar o app.
const TTL_MS = 5 * 60 * 1000;
let cachePromessa = null;
let cacheEm = 0;

function carregarCidades() {
    if (!cachePromessa || Date.now() - cacheEm > TTL_MS) {
        cacheEm = Date.now();
        // GET /api/cidades (backend/routes/cidades.js): lista canônica — distinct de clientes,
        // leads e metas, já passada por normalizarCidade e deduplicada. Auth normal do app.
        // Resposta: { ok, total, cidades: string[], detalhe: [{ cidade, registros }] }.
        cachePromessa = api.get('/cidades')
            .then(r => (Array.isArray(r.data?.cidades) ? r.data.cidades.filter(Boolean) : []))
            .catch(() => { cachePromessa = null; return []; }); // rede/500: tenta de novo na próxima montagem
    }
    return cachePromessa;
}

/** Chamar depois de salvar um cadastro: a próxima montagem do campo recarrega a lista. */
export function invalidarCacheCidades() { cachePromessa = null; cacheEm = 0; }

const CampoCidade = ({ value, onChange, placeholder = 'Cidade', className = '', invalido = false, extraCidades = [] }) => {
    const [cidades, setCidades] = useState([]);

    useEffect(() => {
        let vivo = true;
        carregarCidades().then(lista => { if (vivo) setCidades(lista); });
        return () => { vivo = false; };
    }, []);

    // O valor atual (e as extras) entram na lista para o combobox mostrar o rótulo,
    // mesmo quando a cidade ainda não existe em nenhum cliente ativo.
    const todas = Array.from(new Set([...cidades, ...extraCidades, value].filter(Boolean)));
    const options = todas.map(c => ({ value: c, label: c }));

    const aoMudar = (v) => {
        if (!v) { onChange(''); return; }
        const daLista = cidades.find(c => c === v);
        if (daLista) { onChange(daLista); return; }
        // Cidade nova: se o cadastro for salvo, a próxima abertura do campo já a lista.
        invalidarCacheCidades();
        onChange(normalizarCidade(v) || '');
    };

    return (
        <ComboBusca
            value={value || ''}
            options={options}
            onChange={aoMudar}
            placeholder={placeholder}
            buscaPlaceholder="Digite a cidade…"
            vazioTexto="Nenhuma cidade cadastrada."
            permitirNovo
            novoTexto="Usar"
            invalido={invalido}
            className={className}
        />
    );
};

export default CampoCidade;
