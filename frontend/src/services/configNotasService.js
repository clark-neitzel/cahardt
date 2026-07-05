import api from './api';

const configNotasService = {
    getCertificado: async () => {
        const response = await api.get('/config-notas/certificado');
        return response.data;
    },
    instalarCertificado: async (arquivo, senha) => {
        const fd = new FormData();
        fd.append('arquivo', arquivo);
        fd.append('senha', senha);
        const response = await api.post('/config-notas/certificado', fd, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    }
};

export default configNotasService;
