import api, { API_URL } from './api';

// Contrato: docs/checklist-veiculo/PLANO-dia1.md, seção 5.
const MULTIPART = { 'Content-Type': 'multipart/form-data' };

/** URL de imagem do servidor ('/uploads/...') pronta para <img>. */
export const urlImagem = (caminho) => {
    if (!caminho) return '';
    return /^https?:/i.test(caminho) ? caminho : `${API_URL}${caminho}`;
};

// Versão do app que está rodando (hash do bundle principal): ajuda a achar "quem está com app velho"
const appVersao = () => {
    try { return (document.querySelector('script[src*="/assets/index"]')?.getAttribute('src') || '').match(/index-([\w-]+)/)?.[1] || 'dev'; }
    catch { return 'desconhecida'; }
};

const checklistVeiculoService = {
    // Telemetria: avisa o servidor que o checklist por foto não rodou. Fire-and-forget: NUNCA lança nem bloqueia.
    telemetria: (dados) => {
        try {
            api.post('/checklists-veiculo/telemetria', { ...dados, appVersao: appVersao() }, { timeout: 8000 }).catch(() => {});
        } catch { /* nunca atrapalha o motorista */ }
    },
    // 5.1
    config: async (veiculoId, momento) =>
        (await api.get(`/veiculos/${veiculoId}/checklist-config`, momento && momento !== 'SAIDA' ? { params: { momento } } : undefined)).data,
    // 5.2 (idempotente: devolve o rascunho do dia com as fotos já enviadas)
    criarRascunho: async (veiculoId, extra = {}) =>
        (await api.post('/checklists-veiculo', { veiculoId, momento: 'SAIDA', ...extra })).data,
    // 5.3 (Dia 2: aceita também kmOrigem: 'PAINEL_CONFIRMADO' | 'DIGITADO')
    atualizar: async (id, dados) => (await api.patch(`/checklists-veiculo/${id}`, dados)).data,
    // 5.4 (a IA roda dentro desta chamada: pode levar até ~25 s)
    // Dia 2: { complemento: true } sobe a foto extra (água/óleo): sem IA, não conta como foto do ângulo
    enviarFoto: async (id, angulo, arquivo, onUploadProgress, { complemento = false } = {}) => {
        const form = new FormData();
        form.append('angulo', angulo);
        if (complemento) form.append('complemento', '1');
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
    // Resposta Sim/Não a uma PERGUNTA da IA (indice vem de avaliar().problemas[].indice)
    responder: async (id, { angulo, indice, resposta }) =>
        (await api.post(`/checklists-veiculo/${id}/responder`, { angulo, indice, resposta })).data,
    // Dia 2, 5.5: "Tá certo assim" (desfazer=true volta atrás). Só modo TESTE; nunca vale para REPROVA.
    aceitar: async (id, fotoId, desfazer = false) =>
        (await api.post(`/checklists-veiculo/${id}/fotos/${fotoId}/aceitar`, { desfazer })).data,
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
