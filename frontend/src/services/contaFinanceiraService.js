import api from './api';

const contaFinanceiraService = {
    listar: async () => {
        const response = await api.get('/contas-financeiras');
        return response.data;
    }
};

export default contaFinanceiraService;
