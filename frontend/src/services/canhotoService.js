import api from './api';

/**
 * CANHOTO DA NOTA FISCAL — cliente HTTP de `/api/canhotos`.
 *
 * Regra de ouro do módulo (vale para quem consome daqui): o caminho normal do BIPE
 * NUNCA é erro. `bipar()` devolve `200 { ok:false, motivo }` para chave desconhecida,
 * leitura torta ou número ambíguo — são situações ESPERADAS de quem está com um maço
 * de papel na mão. Por isso NÃO trate `ok:false` com `toast.error` vermelho: leia o
 * `motivo` e explique em português. Só exceção de rede/500 é erro de verdade.
 */
const canhotoService = {
    /** Configuração do módulo (modo OFF/AVISO/TRAVA + dias de alerta). */
    getConfig: async () => {
        const { data } = await api.get('/canhotos/config');
        return data;
    },

    /**
     * O bipe. `texto` é o que caiu no campo (chave de 44, número da nota ou leitura torta).
     * `contexto`: 'MUTIRAO' arquiva na pasta do mês · 'CAIXA' só marca como recebido.
     * `de`/`ate` ajudam a desempatar quando vem só o número da nota.
     * Devolve { ok, jaEstava?, motivo?, mensagem?, canhoto?, opcoes? }.
     */
    bipar: async ({ texto, contexto = 'MUTIRAO', origem = 'LEITOR', de, ate, caixaDiarioId } = {}) => {
        const { data } = await api.post('/canhotos/bipar', { texto, contexto, origem, de, ate, caixaDiarioId });
        return data;
    },

    /** Passa para ARQUIVADO o que já está RECEBIDO. Aceita uma chave ou uma lista. */
    arquivar: async (chaves) => {
        const { data } = await api.post('/canhotos/arquivar', { chaves });
        return data;
    },

    /** "Veio sem assinatura": o papel está no arquivo, mas não serve de prova. */
    semAssinatura: async (chave, observacao) => {
        const { data } = await api.post('/canhotos/sem-assinatura', { chave, observacao });
        return data;
    },

    /**
     * Arquivo do período: contadores, alerta das notas paradas na rua e a lista.
     * `autocura: false` pula o backfill silencioso do backend — use nas recargas
     * rápidas (depois de bipar) para não repetir trabalho pesado a cada leitura.
     */
    listarPeriodo: async ({ de, ate, status, busca, autocura = true } = {}) => {
        const params = { de, ate };
        if (status && status !== 'todos') params.status = status;
        if (busca) params.busca = busca;
        if (!autocura) params.autocura = '0';
        const { data } = await api.get('/canhotos/periodo', { params });
        return data;
    },

    /** "Colocar o mês em dia": traz para o controle as notas do período. Idempotente. */
    backfill: async ({ de, ate }) => {
        const { data } = await api.post('/canhotos/backfill', { de, ate });
        return data;
    },
};

export default canhotoService;
