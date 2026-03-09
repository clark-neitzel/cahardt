import api from './api';

const clienteInsightService = {
    // Busca dados analíticos do cliente (etapa 2)
    obterInsightPorCliente: async (clienteId) => {
        try {
            const response = await api.get(`/api/insights/clientes/${clienteId}`);
            return response.data; // Pode ser null se não houver cálculo ainda
        } catch (error) {
            console.error('Erro ao buscar insights do cliente:', error);
            throw error;
        }
    },

    // Força o recálculo imediato (útil pro botão de Recalcular na UI)
    recalcularManual: async (clienteId) => {
        try {
            const response = await api.post(`/api/insights/clientes/${clienteId}/recalcular`);
            return response.data;
        } catch (error) {
            console.error('Erro ao recalcular insights do cliente:', error);
            throw error;
        }
    }
};

export default clienteInsightService;
