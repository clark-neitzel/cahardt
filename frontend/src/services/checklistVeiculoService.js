import api, { API_URL } from './api';

// Contrato: docs/checklist-veiculo/PLANO-dia1.md, seção 5.
const MULTIPART = { 'Content-Type': 'multipart/form-data' };

/** URL de imagem do servidor ('/uploads/...') pronta para <img>. */
export const urlImagem = (caminho) => {
    if (!caminho) return '';
    return /^https?:/i.test(caminho) ? caminho : `${API_URL}${caminho}`;
};

const checklistVeiculoService = {
    // 5.1
    config: async (veiculoId) => (await api.get(`/veiculos/${veiculoId}/checklist-config`)).data,
    // 5.2 (idempotente: devolve o rascunho do dia com as fotos já enviadas)
    criarRascunho: async (veiculoId, extra = {}) =>
        (await api.post('/checklists-veiculo', { veiculoId, momento: 'SAIDA', ...extra })).data,
    // 5.3
    atualizar: async (id, dados) => (await api.patch(`/checklists-veiculo/${id}`, dados)).data,
    // 5.4 (a IA roda dentro desta chamada: pode levar até ~25 s)
    enviarFoto: async (id, angulo, arquivo, onUploadProgress) => {
        const form = new FormData();
        form.append('angulo', angulo);
        form.append('arquivo', arquivo);
        return (await api.post(`/checklists-veiculo/${id}/fotos`, form, {
            headers: MULTIPART, timeout: 90000, onUploadProgress,
        })).data;
    },
    // 5.5
    pular: async (id, angulo, motivo = 'FALHA_ENVIO') =>
        (await api.post(`/checklists-veiculo/${id}/pular`, { angulo, motivo })).data,
    // 5.6
    avaliar: async (id, kmDigitado) =>
        (await api.post(`/checklists-veiculo/${id}/avaliar`, { kmDigitado })).data,
    // 5.7
    decidir: async (id, decisao) =>
        (await api.post(`/checklists-veiculo/${id}/decisao`, { decisao })).data,
    // 5.9 (escritório)
    listarDoVeiculo: async (veiculoId, params = { limit: 30 }) =>
        (await api.get(`/veiculos/${veiculoId}/checklists`, { params })).data,
    // 5.10 (fotos modelo)
    fotosModelo: async (veiculoId) => (await api.get(`/veiculos/${veiculoId}/fotos-modelo`)).data,
    enviarFotoModelo: async (veiculoId, angulo, arquivo) => {
        const form = new FormData();
        form.append('angulo', angulo);
        form.append('arquivo', arquivo);
        return (await api.post(`/veiculos/${veiculoId}/fotos-modelo`, form, { headers: MULTIPART, timeout: 90000 })).data;
    },
};

export default checklistVeiculoService;
