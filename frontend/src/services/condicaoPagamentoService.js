import api from './api';

const condicaoPagamentoService = {
    listar: async () => {
        const response = await api.get('/condicoes-pagamento');
        return response.data;
    }
};

export default condicaoPagamentoService;
