import api from './api';

// "Cadastros pra acertar" + fila de pedidos de inativação (feitos pelos agentes).
// Rotas /api/cadastro-pendencias — só quem edita clientes (ou admin) acessa.
const cadastroPendenciasService = {
    // grupo 'acertar' (clientes com cadastro incompleto) | 'classificar' (cadastros sem classificação).
    // { grupo, contagens: { acertar, classificar }, page, limit, total, totalPages,
    //   data: [{ id, nome, cidade, documento, vendedorId, vendedor, perfis, classificacao, somenteFornecedor, completo, faltando: [{ campo, rotulo }] }] }
    pendentes: async ({ vendedorId, grupo = 'acertar', page = 1, limit = 50 } = {}) =>
        (await api.get('/cadastro-pendencias/pendentes', { params: { vendedorId: vendedorId || undefined, grupo, page, limit } })).data,

    // classificacao: CLIENTE | FORNECEDOR | CLIENTE_FORNECEDOR | 'automatica' (desfaz a escolha manual)
    classificar: async (clienteId, classificacao) =>
        (await api.post(`/cadastro-pendencias/clientes/${clienteId}/classificacao`, { classificacao })).data,

    // Pede a inativação (entra na mesma fila de aprovação dos pedidos da Ana). motivo: fechou | trocou_dono | parou_de_comprar | numero_errado | outro
    pedirInativacao: async (clienteId, motivo, detalhe) =>
        (await api.post(`/cadastro-pendencias/clientes/${clienteId}/inativacao`, { motivo, detalhe: detalhe || undefined })).data,

    // status: pendente | aprovada | recusada | todas
    inativacoes: async ({ status = 'pendente', page = 1, limit = 50 } = {}) =>
        (await api.get('/cadastro-pendencias/inativacoes', { params: { status, page, limit } })).data,

    // { pendentes: number } — usado no selo do botão
    contagemInativacoes: async () => (await api.get('/cadastro-pendencias/inativacoes/contagem')).data,

    // Cadastros com nome a corrigir (CPF de 1 palavra / CNPJ sem fantasia).
    // { config:{bloquearCpfNomeUnico}, contagem:{cpfNomeUnico,cnpjSemFantasia},
    //   itens:[{UUID,Codigo,Nome,NomeFantasia,Documento,tipo,Tipo_Pessoa,Ativo,idVendedor,vendedorNome,telefone}] }
    nomePendencias: async ({ vendedor, tipo } = {}) =>
        (await api.get('/cadastro-pendencias/nome', { params: { vendedor: vendedor || undefined, tipo: tipo || undefined } })).data,

    // SÓ ADMIN. Liga/desliga o bloqueio de venda de CPF com nome de uma palavra só.
    salvarConfigNome: async (bloquearCpfNomeUnico) =>
        (await api.post('/cadastro-pendencias/nome/config', { bloquearCpfNomeUnico: !!bloquearCpfNomeUnico })).data,

    aprovar: async (id, observacao) =>
        (await api.post(`/cadastro-pendencias/inativacoes/${id}/aprovar`, { observacao: observacao || undefined })).data,

    recusar: async (id, observacao) =>
        (await api.post(`/cadastro-pendencias/inativacoes/${id}/recusar`, { observacao: observacao || undefined })).data,
};

export default cadastroPendenciasService;
