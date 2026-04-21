import api from './api';

const iaLogService = {
    listar: (params) => api.get('/ia-logs', { params }).then(r => r.data),
};

export default iaLogService;
