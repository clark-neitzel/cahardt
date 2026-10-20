import api from './api';

// Etiquetas atuais (produto, caixas Kit Festa/Delivery) como IMAGEM pela fila de impressão direta.
// Contrato: docs/etiquetas-cozinha/CONTRATO-E3.md. Permissão por `origem` é resolvida no servidor.
const impressaoEtiquetasService = {
    impressoras: (origem) => api.get('/impressao/etiquetas/impressoras', { params: { origem } }).then((r) => r.data),
    // payload = { origem, requisicaoId, impressoraId?, referencia?, copias?, bitmaps, sequencia? }
    enviar: (payload) => api.post('/impressao/etiquetas', payload).then((r) => r.data),
    cancelar: (trabalhoId) => api.post(`/impressao/etiquetas/trabalhos/${trabalhoId}/cancelar`).then((r) => r.data),
};

export default impressaoEtiquetasService;
