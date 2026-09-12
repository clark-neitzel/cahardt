import api from './api';

/**
 * CENTRAL DE PENDÊNCIAS — cliente HTTP de `/api/pendencias`.
 *
 * Contrato completo: `backend/docs/pendencias-api.md`. Um único GET agrega os
 * blocos que hoje só aparecem abrindo cada tela separada (Pedidos, NF-e, Caixa,
 * Notas Recebidas, PCP, Tarefas). Cada bloco já vem formatado para exibir direto
 * (título/subtítulo/valor prontos) e, quando existe, `itens[].acao` é a AÇÃO DE
 * 1 CLIQUE — o MESMO endpoint que o botão da tela original chama.
 */
const pendenciasService = {
    /** `limite` = quantas linhas trazer por bloco (padrão 5 no backend). O `contador` de cada bloco é sempre o total real. */
    listar: async (limite = 5) => {
        const { data } = await api.get('/pendencias', { params: { limite } });
        return data;
    },

    /**
     * Executa a ação de 1 clique de um item (`item.acao`): mesmo endpoint que o
     * botão da tela original usa. `acao.endpoint` vem com o prefixo `/api` (é o
     * caminho absoluto da rota no backend) — removido aqui porque a instância
     * `api` já tem `/api` na `baseURL`.
     */
    executarAcao: async (acao) => {
        if (!acao?.endpoint || !acao?.metodo) {
            throw new Error('Ação inválida: faltando endpoint ou método.');
        }
        const caminho = acao.endpoint.replace(/^\/api/, '');
        const metodo = acao.metodo.toLowerCase();
        const { data } = await api.request({ url: caminho, method: metodo, data: acao.body });
        return data;
    },
};

export default pendenciasService;
