import api from './api';

const leadService = {
    /**
     * Lista leads com paginação e filtros (para ListaLeads)
     */
    listar: async (params = {}) => {
        const response = await api.get('/leads', { params });
        return response.data; // { data, total, page, totalPages }
    },

    /**
     * Lista leads para a rota (sem paginação, exclui convertidos/finalizados)
     */
    listarParaRota: async (vendedorId) => {
        const params = vendedorId ? { vendedorId } : {};
        const response = await api.get('/leads/rota', { params });
        return response.data;
    },

    buscarPorId: async (id) => {
        const response = await api.get(`/leads/${id}`);
        return response.data;
    },

    criar: async (data) => {
        const response = await api.post('/leads', data);
        return response.data;
    },

    atualizar: async (id, data) => {
        const response = await api.put(`/leads/${id}`, data);
        return response.data;
    },

    finalizar: async (id) => {
        const response = await api.post(`/leads/${id}/finalizar`);
        return response.data;
    },

    uploadFoto: async (leadId, formData) => {
        const response = await api.post(`/leads/${leadId}/foto`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },

    referenciarCliente: async (leadId, clienteId) => {
        const response = await api.post(`/leads/${leadId}/referenciar`, { clienteId });
        return response.data;
    },

    buscarPorCliente: async (clienteId) => {
        const response = await api.get(`/leads/por-cliente/${clienteId}`);
        return response.data;
    },

    excluir: async (id) => {
        const response = await api.delete(`/leads/${id}`);
        return response.data;
    }
};

export default leadService;
