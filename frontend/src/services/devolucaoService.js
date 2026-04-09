import api from './api';

const devolucaoService = {
    listar: async (filtros = {}) => {
        const response = await api.get('/devolucoes', { params: filtros });
        return response.data;
    },

    detalhar: async (id) => {
        const response = await api.get(`/devolucoes/${id}`);
        return response.data;
    },

    criarEspecial: async (data) => {
        const response = await api.post('/devolucoes/especial', data);
        return response.data;
    },

    criarContaAzul: async (formData) => {
        const response = await api.post('/devolucoes/conta-azul', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },

    reverter: async (id, data) => {
        const response = await api.post(`/devolucoes/${id}/reverter`, data);
        return response.data;
    },

    processarCA: async (id, etapa) => {
        const response = await api.post(`/devolucoes/${id}/processar-ca`, { etapa });
        return response.data;
    },

    uploadBoleto: async (id, file) => {
        const formData = new FormData();
        formData.append('pdfBoleto', file);
        const response = await api.post(`/devolucoes/${id}/upload-boleto`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },
};

export default devolucaoService;
