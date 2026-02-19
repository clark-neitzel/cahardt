import axios from 'axios';

const API_URL = 'http://localhost:3000/api/contas-financeiras';

const contaFinanceiraService = {
    listar: async () => {
        const response = await axios.get(API_URL);
        return response.data;
    }
};

export default contaFinanceiraService;
