import api from './api';

const fornecedorService = {
    listar: async (busca = '') => {
        const response = await api.get('/fornecedores', { params: busca ? { busca } : {} });
        return response.data;
    },
    // Opções do campo Fornecedor da despesa: fornecedores + pessoas marcadas como Fornecedor em Clientes
    // que ainda não têm linha em fornecedores (existe:false, id:null, clienteId preenchido).
    opcoesDespesa: async (busca = '') => {
        const response = await api.get('/fornecedores/opcoes-despesa', { params: busca ? { busca } : {} });
        return response.data;
    },
    // Garante o fornecedor desta pessoa (idempotente). Retorna { fornecedor, jaExistia }.
    daPessoa: async (clienteId) => {
        const response = await api.post(`/fornecedores/da-pessoa/${encodeURIComponent(clienteId)}`);
        return response.data;
    },
    criar: async (dados) => {
        const response = await api.post('/fornecedores', dados);
        return response.data;
    },
    atualizar: async (id, dados) => {
        const response = await api.put(`/fornecedores/${id}`, dados);
        return response.data;
    },
    // Cria (ou devolve, se já existir pelo documento) o cadastro de pessoa deste fornecedor —
    // usado pelo Novo Usuário/Vincular cadastro. Retorna { cliente, jaExistia? }.
    criarCadastroPessoa: async (id) => {
        const response = await api.post(`/fornecedores/${id}/cadastro-pessoa`);
        return response.data;
    },
    // Exclui um fornecedor. Se tiver despesas/notas ligadas, passe mesclarComId (destino, mesmo CNPJ).
    excluir: async (id, mesclarComId) => {
        const response = await api.post(`/fornecedores/${id}/excluir`, mesclarComId ? { mesclarComId } : {});
        return response.data;
    }
};

export default fornecedorService;
