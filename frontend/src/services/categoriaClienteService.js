import api from './api';

const categoriaClienteService = {
    listar: async () => {
        const res = await api.get('/categorias-cliente');
        return res.data;
    },
    detalhar: async (id) => {
        const res = await api.get(`/categorias-cliente/${id}`);
        return res.data;
    },
    criar: async (dados) => {
        const res = await api.post('/categorias-cliente', dados);
        return res.data;
    },
    atualizar: async (id, dados) => {
        const res = await api.put(`/categorias-cliente/${id}`, dados);
        return res.data;
    },
    deletar: async (id) => {
        const res = await api.delete(`/categorias-cliente/${id}`);
        return res.data;
    }
};

export default categoriaClienteService;
