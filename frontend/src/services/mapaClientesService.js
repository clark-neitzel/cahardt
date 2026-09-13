import api from './api';

// Mapa de Clientes (contrato fechado em docs/mapa-clientes/PLANO.md, seção 3).
// Só leitura aqui; a edição rápida do cliente continua em clienteService.atualizar
// (PATCH /clientes/:uuid) e o WhatsApp no ModalWhatsappCliente.
const mapaClientesService = {
    // Carga completa: clientes (com/sem GPS), totais e opções de filtro.
    // ativo: 'true' (padrão) | 'false' | 'todos'
    carregar: async ({ ativo = 'true' } = {}) => {
        const response = await api.get('/mapa-clientes', { params: { ativo } });
        return response.data;
    },
    // Pares de vizinhos atendidos em dias de entrega diferentes.
    vizinhos: async ({ raio, limite = 200, ativo = 'true' } = {}) => {
        const params = { limite, ativo };
        if (raio != null) params.raio = raio;
        const response = await api.get('/mapa-clientes/vizinhos', { params });
        return response.data;
    },
    config: async () => {
        const response = await api.get('/mapa-clientes/config');
        return response.data;
    },
    // Só admin || clientes.edit (backend devolve 403 para os demais)
    salvarConfig: async ({ raioMetros }) => {
        const response = await api.put('/mapa-clientes/config', { raioMetros });
        return response.data;
    }
};

export default mapaClientesService;
