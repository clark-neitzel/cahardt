import api from './api';
import { normalizarCidade } from '../utils/cidade';

// Cadastro oficial de cidades (tabela `cidades`) — contrato do §4 de
// docs/cidades/PLANO-CADASTRO.md. Todo campo Cidade do app só aceita item desta lista.
//
// Cache da lista por 5 min (a lista muda pouco); qualquer escrita daqui invalida.

const TTL_MS = 5 * 60 * 1000;
let cachePromessa = null;
let cacheEm = 0;

/** Chamar depois de criar/editar/fundir cidade: a próxima montagem do campo recarrega. */
export function invalidarCacheCidades() { cachePromessa = null; cacheEm = 0; }

/**
 * Lista ativa para os dropdowns: [{ id, nome, uf, registros }].
 * Resposta do GET /cidades: { ok, total, cidades: string[], detalhe: [{ id?, cidade, registros, uf? }] }
 * (o formato antigo só tinha `cidades[]` — cai nele quando `detalhe` não vier).
 * Erro de rede/500 REJEITA (o campo mostra "tentar de novo") — não volta a texto livre.
 */
export function listarCidadesCache() {
    if (!cachePromessa || Date.now() - cacheEm > TTL_MS) {
        cacheEm = Date.now();
        cachePromessa = api.get('/cidades')
            .then(r => {
                const d = r.data || {};
                if (Array.isArray(d.detalhe) && d.detalhe.length) {
                    return d.detalhe
                        .filter(x => x && x.cidade)
                        .map(x => ({ id: x.id || null, nome: x.cidade, uf: x.uf || null, registros: x.registros ?? null }));
                }
                return (Array.isArray(d.cidades) ? d.cidades : []).filter(Boolean).map(c => ({ id: null, nome: c, uf: null, registros: null }));
            })
            .catch(e => { cachePromessa = null; throw e; });
    }
    return cachePromessa;
}

const cidadeService = {
    /** { incluirInativas: true } → pede também as inativas (tela Cidades); o GET antigo ignora o parâmetro. */
    listar: async ({ incluirInativas = false } = {}) => {
        const res = await api.get('/cidades', { params: incluirInativas ? { incluirInativas: 1 } : undefined });
        return res.data;
    },
    /** { existe:true, cidade:{id,nome,uf} } | { existe:false, nomeSugerido, sugestoes:[{id,nome,uf,distancia}] } */
    resolver: async (nome, uf) => {
        const res = await api.get('/cidades/resolver', { params: { nome, uf: uf || undefined } });
        return res.data;
    },
    sugestoes: async (nome) => {
        const res = await api.get('/cidades/sugestoes', { params: { nome } });
        return Array.isArray(res.data?.sugestoes) ? res.data.sugestoes : [];
    },
    criar: async ({ nome, uf, ibge, confirmarParecida }) => {
        const res = await api.post('/cidades', { nome, uf, ibge: ibge || undefined, confirmarParecida: confirmarParecida || undefined });
        invalidarCacheCidades();
        return res.data; // { cidade }
    },
    editar: async (id, dados) => {
        const res = await api.put(`/cidades/${id}`, dados);
        invalidarCacheCidades();
        return res.data;
    },
    inativar: async (id) => {
        const res = await api.post(`/cidades/${id}/inativar`);
        invalidarCacheCidades();
        return res.data;
    },
    reativar: async (id) => {
        const res = await api.post(`/cidades/${id}/reativar`);
        invalidarCacheCidades();
        return res.data;
    },
    /** dryRun:true → plano (linhas por tabela, colisões de meta); false → aplica com snapshot */
    fundir: async (origemId, destinoId, dryRun = true) => {
        const res = await api.post(`/cidades/${origemId}/fundir`, { destinoId, dryRun: !!dryRun });
        if (!dryRun) invalidarCacheCidades();
        return res.data;
    },
    pendentes: async () => {
        const res = await api.get('/cidades/pendentes');
        const d = res.data;
        return Array.isArray(d) ? d : (Array.isArray(d?.pendentes) ? d.pendentes : []);
    },
    /** { cidadeId } (apontar p/ existente) ou { criar: { nome, uf } } */
    resolverPendente: async (id, corpo) => {
        const res = await api.post(`/cidades/pendentes/${id}/resolver`, corpo);
        invalidarCacheCidades();
        return res.data;
    },
    invalidarCacheCidades,
};

/**
 * Cidade vinda da consulta de CNPJ (Receita devolve MAIÚSCULO). Nunca preenche o form
 * fora da lista: existe → { ok:true, nome }; não existe → { ok:false, nome, uf, sugestoes }
 * para a tela abrir o ModalCidadeReceita. Sem cidade → { ok:true, nome:'' }.
 * Falha de rede na resolução → trata como "não existe" (o usuário escolhe da lista).
 */
export async function resolverCidadeDaReceita({ cidade, uf }) {
    const nome = normalizarCidade(cidade || '') || '';
    if (!nome) return { ok: true, nome: '' };
    try {
        const r = await cidadeService.resolver(nome, uf);
        if (r?.existe && r.cidade?.nome) return { ok: true, nome: r.cidade.nome };
        return { ok: false, nome: r?.nomeSugerido || nome, uf: uf || '', sugestoes: Array.isArray(r?.sugestoes) ? r.sugestoes : [] };
    } catch {
        return { ok: false, nome, uf: uf || '', sugestoes: [] };
    }
}

/**
 * Lê o erro padrão das rotas de negócio: 400 { codigo:'CIDADE_NAO_CADASTRADA', cidade, sugestoes }.
 * Devolve { cidade, sugestoes } ou null quando o erro é outro.
 */
export function erroCidadeNaoCadastrada(e) {
    const d = e?.response?.data;
    if (!d || d.codigo !== 'CIDADE_NAO_CADASTRADA') return null;
    return { cidade: d.cidade || '', sugestoes: Array.isArray(d.sugestoes) ? d.sugestoes : [] };
}

/** Permissão de CRIAR cidade — espelha o backend: admin || clientes.edit || rota.edit (§6 do plano). */
export function podeCriarCidade(perms) {
    const p = perms || {};
    return !!(p.admin || p.clientes?.edit || p.rota?.edit);
}

/** Permissão de GERIR (editar, inativar, fundir, pendências): admin || tab configuracoes. */
export function podeGerirCidades(perms) {
    const p = perms || {};
    const cfg = p.configuracoes;
    return !!(p.admin || cfg === true || cfg?.edit === true);
}

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

export default cidadeService;
