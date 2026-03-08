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
    deletar: async (id) => {
        const res = await api.delete(`/categorias-produto/${id}`);
        return res.data;
    }
};

export default categoriaProdutoService;
