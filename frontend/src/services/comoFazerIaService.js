import api, { API_URL } from './api';

// ─────────────────────────────────────────────────────────────────────────────
// "Começar com a IA" (Como Fazer) — contrato em docs/pop/plano-ia-pop-fase1.md §6.
//  - montarStream: SSE lido com fetch + getReader (EventSource não faz POST nem manda Authorization;
//    axios não entrega o corpo aos poucos). Um 401 aqui NÃO desloga o usuário: só vira mensagem.
//  - demais chamadas: axios `api` normal (só endpoints /ia/*, que nunca respondem 401 por "senha errada").
// ─────────────────────────────────────────────────────────────────────────────

const tokenApp = () => { try { return localStorage.getItem('@HardtApp:token') || ''; } catch { return ''; } };

/** Erro HTTP do fetch no mesmo formato lido por mensagemErro/codigoErro. */
function erroHttp(status, corpo) {
    const e = new Error(corpo?.erro || `Erro ${status}`);
    e.response = { status, data: corpo || {} };
    return e;
}

/** Parser de SSE: recebe pedaços de texto e chama `aoEvento(nome, dados)` a cada evento completo. */
export function criarParserSse(aoEvento) {
    let resto = '';
    const processarBloco = (bloco) => {
        let nome = 'message';
        const dados = [];
        for (const linha of bloco.split('\n')) {
            if (!linha || linha.startsWith(':')) continue;            // heartbeat / comentário
            const i = linha.indexOf(':');
            const campo = i === -1 ? linha : linha.slice(0, i);
            let valor = i === -1 ? '' : linha.slice(i + 1);
            if (valor.startsWith(' ')) valor = valor.slice(1);
            if (campo === 'event') nome = valor;
            else if (campo === 'data') dados.push(valor);
        }
        if (!dados.length) return;
        let json = null;
        try { json = JSON.parse(dados.join('\n')); } catch { return; }  // evento truncado: ignora
        aoEvento(nome, json);
    };
    return {
        empurrar(pedaco) {
            resto = (resto + pedaco).replace(/\r\n/g, '\n');   // normaliza sobre o acumulado (chunk pode terminar em \r)
            let i;
            while ((i = resto.indexOf('\n\n')) !== -1) {
                processarBloco(resto.slice(0, i));
                resto = resto.slice(i + 2);
            }
        },
        fechar() { if (resto.trim()) processarBloco(resto); resto = ''; },
    };
}

/**
 * Monta o POP em streaming. Resolve com 'fim' | 'erro' | 'caiu' | 'cancelado'.
 * Erro HTTP antes do stream (400/409/429/503…) REJEITA com `e.response.data` ({erro, codigo, …}).
 */
export async function montarStream({ corpo, onEvento, signal }) {
    let resp;
    try {
        resp = await fetch(`${API_URL}/api/como-fazer/ia/montar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${tokenApp()}` },
            body: JSON.stringify(corpo),
            signal,
        });
    } catch (e) {
        if (signal?.aborted || e?.name === 'AbortError') return 'cancelado';
        return 'caiu';
    }
    if (!resp.ok) {
        let json = null;
        try { json = await resp.json(); } catch { /* corpo não é JSON */ }
        throw erroHttp(resp.status, json);
    }
    if (!resp.body || !resp.body.getReader) {
        // navegador sem stream: lê tudo e processa de uma vez (os eventos chegam juntos no fim)
        const texto = await resp.text();
        let desfecho = 'caiu';
        const p = criarParserSse((n, d) => { if (n === 'fim') desfecho = 'fim'; else if (n === 'erro') desfecho = 'erro'; onEvento(n, d); });
        p.empurrar(texto); p.fechar();
        return desfecho;
    }
    const leitor = resp.body.getReader();
    const dec = new TextDecoder('utf-8');
    let desfecho = null;
    const parser = criarParserSse((nome, dados) => {
        if (nome === 'fim') desfecho = 'fim';
        else if (nome === 'erro') desfecho = 'erro';
        onEvento(nome, dados);
    });
    try {
        for (;;) {
            const { done, value } = await leitor.read();
            if (done) break;
            parser.empurrar(dec.decode(value, { stream: true }));
            if (desfecho) break;
        }
        parser.empurrar(dec.decode());
        parser.fechar();
    } catch (e) {
        if (signal?.aborted || e?.name === 'AbortError') return 'cancelado';
        return desfecho || 'caiu';
    }
    try { leitor.cancel(); } catch { /* já fechado */ }
    return desfecho || 'caiu';
}

/** Mensagem em português simples para cada código do contrato (§6/§9). `e` é erro HTTP; `d` é {erro,codigo} do evento SSE. */
export function mensagemDeErroIa(origem) {
    const d = origem?.response?.data || origem || {};
    const status = origem?.response?.status;
    const codigo = d.codigo || '';
    if (!origem?.response && !d.codigo && !d.erro) return 'Sem conexão com o servidor.';
    if (status === 401) return 'Sua sessão do app venceu. Entre de novo e tente outra vez.';
    switch (codigo) {
        case 'LIMITE_DIA': return `O limite de hoje (${d.limite ?? '?'}) acabou. Volte amanhã ou comece em branco.`;
        case 'IA_DESLIGADA': case 'IA_SEM_CHAVE': case 'PROVEDOR_INDISPONIVEL': return 'A IA está desligada. Você pode começar em branco.';
        case 'JA_MONTANDO': return 'Você já tem um POP sendo montado (talvez em outra aba). Espere terminar e tente de novo.';
        case 'IA_RECUSOU': return 'A IA não aceitou este pedido. Reescreva com outras palavras ou comece em branco.';
        case 'PEDIDO_GRANDE': return 'O pedido ficou grande demais. Encurte o texto e tente de novo.';
        case 'IA_DEMOROU': return 'A IA demorou demais. Tente de novo.';
        case 'IA_CORTOU': return 'A resposta da IA veio cortada. Tente o tamanho “Curto” ou tente de novo.';
        case 'IA_FALHOU': return 'A IA não conseguiu montar um POP válido. Tente de novo ou comece em branco.';
        default: return d.erro || 'Não deu certo. Tente de novo.';
    }
}

const iaService = {
    status: async () => (await api.get('/como-fazer/ia/status')).data,
    melhorarPasso: async (corpo) => (await api.post('/como-fazer/ia/passo', corpo, { timeout: 90000 })).data,
    sugerir: async (corpo) => (await api.post('/como-fazer/ia/sugerir', corpo, { timeout: 90000 })).data,
    resultado: async (usoId, resultado, conteudoId) => (await api.post(`/como-fazer/ia/usos/${usoId}/resultado`, { resultado, ...(conteudoId ? { conteudoId } : {}) })).data,
    itensPcp: async (busca) => (await api.get('/como-fazer/ia/itens-pcp', { params: { busca } })).data,
    // — Configurações → Inteligência artificial —
    configGet: async () => (await api.get('/config/ia')).data,
    configPut: async (corpo) => (await api.put('/config/ia', corpo)).data,
    uso: async (mes) => (await api.get('/config/ia/uso', { params: { mes } })).data,
};

/** Registra a decisão da pessoa sobre uma sugestão. Falha aqui nunca atrapalha ninguém. */
export function registrarResultado(usoId, resultado, conteudoId) {
    if (!usoId) return Promise.resolve();
    return iaService.resultado(usoId, resultado, conteudoId).catch(() => {});
}

export default iaService;
