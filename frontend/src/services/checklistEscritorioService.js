import api from './api';

// Contrato: docs/checklist-veiculo/PLANO-dia2.md, seções 5.6 a 5.11 (lado escritório).
const checklistEscritorioService = {
    // 5.6 (só admin)
    avisosConfig: async () => (await api.get('/checklists-veiculo/config/avisos')).data,
    salvarAvisos: async (corpo) => (await api.put('/checklists-veiculo/config/avisos', corpo)).data,
    // 5.7 (manda para o telefone do próprio admin logado)
    testarAviso: async () => (await api.post('/checklists-veiculo/config/avisos/testar')).data,
    // 5.8 chave de emergência
    modo: async () => (await api.get('/checklists-veiculo/config/modo')).data,
    salvarModo: async (modo) => (await api.put('/checklists-veiculo/config/modo', { modo })).data,
    // 5.9 { dataReferencia, itens:[{veiculoId, emUso, motorista, checklist}] }
    hoje: async () => (await api.get('/veiculos/checklists-hoje')).data,
};

export default checklistEscritorioService;
