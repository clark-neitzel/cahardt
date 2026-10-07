import api from './api';
import { mockIndicador } from './indicadoresGestaoMock';

// Cliente da API /api/indicadores-gestao (contrato congelado no plano, seção 3.3).
// A API real é SEMPRE o caminho principal. Só quando a rota ainda não existe no
// servidor (404) cai no mock local — e devolve `exemplo: true` para a tela mostrar
// o selo "dados de exemplo". Qualquer outro erro (403, 500, rede) sobe normalmente.
const BASE = '/indicadores-gestao';

function limpar(params = {}) {
    const out = {};
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') out[k] = v;
    });
    return out;
}

export async function buscarIndicador(rota, params) {
    try {
        const resp = await api.get(`${BASE}/${rota}`, { params: limpar(params) });
        return { dados: resp.data, exemplo: false };
    } catch (e) {
        // mock SÓ em desenvolvimento; em produção 404 é erro de verdade (vira mensagem no bloco)
        if (import.meta.env.DEV && e?.response?.status === 404) {
            const mock = mockIndicador(rota, params || {});
            if (mock) return { dados: mock, exemplo: true };
        }
        throw e;
    }
}

export async function salvarAliquota(aliquotaImpostoVenda) {
    const resp = await api.put(`${BASE}/config`, { aliquotaImpostoVenda });
    return resp.data;
}

// Metas dos indicadores (só admin grava). `metas` = só as linhas alteradas:
// [{ indicador, alvo: number|null (null = remover), toleranciaAtencao?, toleranciaAgir? }]
export async function salvarMetas(metas) {
    const resp = await api.put(`${BASE}/metas`, { metas });
    return resp.data;
}
