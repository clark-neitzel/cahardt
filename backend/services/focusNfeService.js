// Cliente HTTP da Focus NFe (emissão de NF-e de produto).
// Contrato completo: backend/docs/focus-nfe-api.md
// Envs (EasyPanel): FOCUS_NFE_AMBIENTE ('homologacao'|'producao'),
//   FOCUS_NFE_TOKEN_HOMOLOGACAO, FOCUS_NFE_TOKEN_PRODUCAO, FOCUS_NFE_TOKEN_CONTA.

const URLS = {
    producao: 'https://api.focusnfe.com.br',
    homologacao: 'https://homologacao.focusnfe.com.br',
};

function ambiente() {
    return process.env.FOCUS_NFE_AMBIENTE === 'producao' ? 'producao' : 'homologacao';
}

function urlBase() {
    return URLS[ambiente()];
}

function token() {
    return ambiente() === 'producao'
        ? process.env.FOCUS_NFE_TOKEN_PRODUCAO
        : process.env.FOCUS_NFE_TOKEN_HOMOLOGACAO;
}

function authHeader() {
    const t = token();
    if (!t) throw new Error(`Token Focus NFe do ambiente ${ambiente()} não configurado (env).`);
    return 'Basic ' + Buffer.from(`${t}:`).toString('base64');
}

/**
 * Chamada genérica à API. O 401 da Focus volta como HTML (não JSON) — tratado à parte.
 * Retorna { httpStatus, data } onde data é o JSON da Focus (ou { erro_html } no 401).
 */
async function chamar(metodo, caminho, body) {
    const resp = await fetch(urlBase() + caminho, {
        method: metodo,
        headers: {
            Authorization: authHeader(),
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30000),
    });
    const texto = await resp.text();
    let data;
    try { data = JSON.parse(texto); }
    catch { data = { erro_html: texto.slice(0, 300) }; }
    return { httpStatus: resp.status, data };
}

module.exports = {
    ambiente,
    urlBase,

    /** POST /v2/nfe?ref= — aceita para processamento (202) ou devolve erro de validação (422). */
    emitir(ref, nota) {
        return chamar('POST', `/v2/nfe?ref=${encodeURIComponent(ref)}`, nota);
    },

    /** GET /v2/nfe/REF — status atual (processando_autorizacao | autorizado | erro_autorizacao...). */
    consultar(ref, completa = false) {
        return chamar('GET', `/v2/nfe/${encodeURIComponent(ref)}${completa ? '?completa=1' : ''}`);
    },

    /** DELETE /v2/nfe/REF — cancelamento (prazo legal ~24h; justificativa 15–255 chars). */
    cancelar(ref, justificativa) {
        return chamar('DELETE', `/v2/nfe/${encodeURIComponent(ref)}`, { justificativa });
    },

    /** POST /v2/nfe/REF/carta_correcao — CCe (15–1000 chars; não corrige valores/destinatário). */
    cartaCorrecao(ref, correcao) {
        return chamar('POST', `/v2/nfe/${encodeURIComponent(ref)}/carta_correcao`, { correcao });
    },

    /** POST /v2/nfe/REF/email — reenvia DANFE/XML por e-mail (máx. 10 destinatários). */
    enviarEmail(ref, emails) {
        return chamar('POST', `/v2/nfe/${encodeURIComponent(ref)}/email`, { emails });
    },

    /**
     * Baixa um arquivo devolvido pela consulta (caminho_danfe / caminho_xml_nota_fiscal).
     * Devolve Buffer. O caminho já vem relativo à URL base do ambiente.
     */
    async baixarArquivo(caminho) {
        const resp = await fetch(urlBase() + caminho, {
            headers: { Authorization: authHeader() },
            signal: AbortSignal.timeout(30000),
        });
        if (!resp.ok) throw new Error(`Download ${caminho} falhou: HTTP ${resp.status}`);
        return Buffer.from(await resp.arrayBuffer());
    },
};
