import api from './api';

const notasEntradaService = {
    // Lista notas + status da captura: { statusCaptura, notas }
    listar: async (params = {}) => {
        const response = await api.get('/notas-entrada', { params });
        return response.data;
    },
    // Detalhe: nota + itens (com vínculo) + duplicatas
    detalhe: async (id) => {
        const response = await api.get(`/notas-entrada/${id}`);
        return response.data;
    },
    // Busca UNIFICADA de produtos + insumos para vincular:
    // [{ tipo:'PRODUTO'|'PCP', id, value:'PROD:<id>'|'PCP:<id>', nome, unidade, sub }]
    itensPcp: async (busca = '') => {
        const response = await api.get('/notas-entrada/itens-pcp', { params: busca ? { busca } : {} });
        return response.data;
    },
    // Gera a Conta a Pagar da nota; itens vinculados somam no estoque.
    // → resposta inclui estoque: [{ nome, unidade, quantidade, destino }] (vazio se nenhum item vinculado)
    gerarConta: async (id, dados) => {
        const response = await api.post(`/notas-entrada/${id}/gerar-conta`, dados);
        return response.data;
    },
    // Parcelas do Contas a Pagar candidatas a receber esta nota (mesmo fornecedor por padrão,
    // incluindo as JÁ PAGAS; `busca` procura em qualquer fornecedor).
    // → { notaValor, jaVinculadoTotal, parcelas: [...] }
    parcelasCompativeis: async (id, busca = '') => {
        const response = await api.get(`/notas-entrada/${id}/parcelas-compativeis`, {
            params: busca ? { busca } : {}
        });
        return response.data;
    },
    // Anexa a nota a parcela(s) JÁ lançada(s) — não cria despesa nova.
    // payload: { vinculos: [{ parcelaPagarId, valorVinculado }], acaoDiferenca, observacao }
    vincularParcelas: async (id, payload) => {
        const response = await api.post(`/notas-entrada/${id}/vincular-parcelas`, payload);
        return response.data;
    },
    // Desfaz o vínculo — sem `parcelaPagarId` desfaz todos.
    desvincularParcelas: async (id, parcelaPagarId) => {
        const response = await api.post(`/notas-entrada/${id}/desvincular-parcelas`,
            parcelaPagarId ? { parcelaPagarId } : {});
        return response.data;
    },
    // Registra a ENTRADA sem gerar pagamento (bonificação, amostra, remessa/troca, comodato, outro).
    // Itens vinculados SOMAM NO ESTOQUE (sem alterar o custo).
    // payload: { motivo, observacao?, itens?: [{ itemId, vinculo: 'PROD:<id>'|'PCP:<id>'|null, fatorConversao|null, criarItemPcp|null }] }
    // → { ok, message, status, motivo, estoque: [{ nome, unidade, quantidade, destino }] }
    registrarEntrada: async (id, payload) => {
        const response = await api.post(`/notas-entrada/${id}/registrar-entrada`, payload);
        return response.data;
    },
    // Desfaz o registro de entrada sem pagamento — a nota volta para conferência (estoque estornado).
    // → { ok, message, status, avisos?: [] }
    desfazerEntrada: async (id) => {
        const response = await api.post(`/notas-entrada/${id}/desfazer-entrada`);
        return response.data;
    },
    ignorar: async (id) => {
        const response = await api.post(`/notas-entrada/${id}/ignorar`);
        return response.data;
    },
    reativar: async (id) => {
        const response = await api.post(`/notas-entrada/${id}/reativar`);
        return response.data;
    },
    // Cancela a entrada gerada (Conta a Pagar) e reabre a nota para nova conferência (estoque estornado).
    // → { ok, message, avisoCA?, avisos?: [] }
    cancelarConferencia: async (id) => {
        const response = await api.post(`/notas-entrada/${id}/cancelar-conferencia`);
        return response.data;
    },
    // Corrige SÓ o estoque/custo de uma nota já lançada (produto ou conversão errados),
    // sem tocar na despesa, nas parcelas nem nos pagamentos. O valor da nota é intocável —
    // o payload só diz para onde vai e em que conversão.
    // payload: { itens: [{ itemId, vinculo: 'PROD:<id>'|'PCP:<id>'|null, fatorConversao|null, criarItemPcp|null }] }
    // → { ok, message, antes: [], depois: [], custos: [], avisos: [] }
    corrigirEntradaEstoque: async (id, payload) => {
        const response = await api.post(`/notas-entrada/${id}/corrigir-entrada-estoque`, payload);
        return response.data;
    },
    consultarAgora: async () => {
        const response = await api.post('/notas-entrada/consultar-agora');
        return response.data;
    },
    // Importa o XML de UMA nota (NF-e ou NFS-e nacional). Envia o conteúdo cru como texto.
    // Retorna { ok, jaExistia, statusAnterior, nota }.
    importarXml: async (xmlText) => {
        const response = await api.post('/notas-entrada/importar-xml', xmlText, {
            headers: { 'Content-Type': 'text/plain' }
        });
        return response.data;
    },
    // Lança uma nota manualmente (sem XML) — { tipo, fornecedorCnpj, fornecedorNome, numero, emissao, valorTotal }.
    lancarManual: async (dados) => {
        const response = await api.post('/notas-entrada/lancar-manual', dados);
        return response.data;
    },
    // Busca uma NF-e na SEFAZ pela chave de acesso (44 dígitos) — { ok, jaExistia, aguardandoXml, nota } ou { ok:false, emEspera, proximaConsultaEm }.
    buscarPorChave: async (chave) => {
        const response = await api.post('/notas-entrada/buscar-chave', { chave });
        return response.data;
    },
    // Agenda a busca por chave (quando a SEFAZ está no intervalo de espera) — { ok, agendada, proximaConsultaEm }.
    agendarBuscaChave: async (chave) => {
        const response = await api.post('/notas-entrada/buscar-chave/agendar', { chave });
        return response.data;
    },
    // XML da nota (blob, para baixar/abrir com o token de auth)
    baixarXml: async (id) => {
        const response = await api.get(`/notas-entrada/${id}/xml`, { responseType: 'blob' });
        return response.data;
    },
    // DANFE para impressão (HTML como texto, com o token de auth)
    danfe: async (id) => {
        const response = await api.get(`/notas-entrada/${id}/danfe`, { responseType: 'text' });
        return response.data;
    }
};

export default notasEntradaService;
