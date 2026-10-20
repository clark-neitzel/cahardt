import api from './api';

// Cadastro de Setores (tabela `setores`). Contrato: docs/pop/plano-setores.md §4/§6.
// Leitura: qualquer logado. Escrita: admin || configuracoes === true || configuracoes.edit === true.

const setorService = {
    /** todos=true devolve inativos e a contagem de uso. */
    listar: async ({ todos = false } = {}) => {
        const r = await api.get('/setores', { params: todos ? { todos: 1 } : {} });
        return r.data || {};
    },
    criar: async (dados) => (await api.post('/setores', dados)).data,
    atualizar: async (id, dados) => (await api.put(`/setores/${id}`, dados)).data,
    reordenar: async (itens) => (await api.put('/setores/ordem', { itens })).data,
    excluir: async (id) => (await api.delete(`/setores/${id}`)).data,
};

export function podeGerirSetores(user) {
    const p = user?.permissoes || {};
    const cfg = p.configuracoes;
    return !!(p.admin || user?.isAdmin || cfg === true || cfg?.edit === true);
}

/** "COZINHA" -> "Cozinha" (fallback quando a lista não carrega). */
export function capitalizarCodigo(codigo) {
    const c = String(codigo || '').replace(/_/g, ' ').trim().toLowerCase();
    return c ? c.charAt(0).toUpperCase() + c.slice(1) : '';
}

export default setorService;
