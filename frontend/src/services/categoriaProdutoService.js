import api from './api';

const categoriaProdutoService = {
    listar: async () => {
        const res = await api.get('/categorias-produto');
        return res.data;
    },
    detalhar: async (id) => {
        const res = await api.get(`/categorias-produto/${id}`);
        return res.data;
    },
    criar: async (dados) => {
        const res = await api.post('/categorias-produto', dados);
        return res.data;
    },
    atualizar: async (id, dados) => {
        const res = await api.put(`/categorias-produto/${id}`, dados);
        return res.data;
    },
    // Quantos produtos usam a categoria (o que se perde ao apagá-la)
    uso: async (id) => {
        const res = await api.get(`/categorias-produto/${id}/uso`);
        return res.data;
    },
    // confirmar=true é a confirmação explícita para apagar categoria que ainda
    // tem produtos; sem ela o backend recusa com 409 e devolve a contagem.
    deletar: async (id, { confirmar = false } = {}) => {
        const res = await api.delete(`/categorias-produto/${id}${confirmar ? '?confirmar=1' : ''}`);
        return res.data;
    }
};

export default categoriaProdutoService;
