/**
 * Regra de NOME no cadastro de cliente (pedido do dono, 11/2026) — ponto ÚNICO.
 *
 *   - CPF (11 dígitos): nome precisa ter nome + sobrenome (pelo menos 2 palavras).
 *   - CNPJ (14 posições): razão social (Nome) E nome fantasia (NomeFantasia) obrigatórios.
 *
 * Função PURA (sem banco, sem req/res): usada pelo cadastro manual (criar) e pela edição (PATCH);
 * reaproveitável por qualquer bloqueio de "cadastro a corrigir". O frontend valida igual na tela.
 */
const { ehCpf, ehCnpj, normalizarDoc } = require('./documento');

const MSG_CPF = 'CPF exige nome e sobrenome (ex.: Maria Silva)';
const MSG_CNPJ = 'CNPJ exige razão social e nome fantasia';

/** Quantas palavras tem o texto (ignora espaços duplicados/nas pontas). */
function contarPalavras(nome) {
    return String(nome == null ? '' : nome).trim().split(/\s+/).filter(Boolean).length;
}

/** CPF (11 dígitos) com nome de uma palavra só (ou vazio)? É o caso a corrigir. */
function cpfComNomeIncompleto(documento, nome) {
    return ehCpf(documento) && contarPalavras(nome) < 2;
}

/**
 * Valida nome conforme o tipo do documento.
 * Devolve `{ ok: true }` ou `{ ok: false, erro: '<mensagem em português>' }`.
 * Documento que não é CPF nem CNPJ (vazio/inválido) não é problema DESTE helper — devolve ok;
 * quem chama já valida o documento à parte.
 */
function validarNomeCadastro({ documento, nome, nomeFantasia } = {}) {
    if (ehCpf(documento)) {
        return contarPalavras(nome) >= 2 ? { ok: true } : { ok: false, erro: MSG_CPF };
    }
    if (ehCnpj(documento)) {
        const razao = String(nome == null ? '' : nome).trim();
        const fantasia = String(nomeFantasia == null ? '' : nomeFantasia).trim();
        return (razao && fantasia) ? { ok: true } : { ok: false, erro: MSG_CNPJ };
    }
    return { ok: true };
}

/**
 * O documento ENVIADO é diferente do que está salvo? Compara os dois NORMALIZADOS: cadastro antigo
 * salvo com pontuação ("529.982.247-25") e o mesmo documento enviado limpo NÃO é mudança — senão a
 * edição de outro campo (ex.: telefone) cairia na regra do nome e travaria.
 */
function documentoMudou(docSalvo, docEnviado) {
    return normalizarDoc(docEnviado) !== normalizarDoc(docSalvo);
}

/**
 * Situação de "CADASTRO A CORRIGIR" de um cliente EXISTENTE (derivada — não é coluna).
 * Reusa validarNomeCadastro (sem duplicar a regra).
 *   - CPF com nome de 1 palavra  → { tipo:'CPF_NOME_UNICO',    campo:'Nome',                 mensagem:MSG_CPF }  (pode BLOQUEAR venda)
 *   - CNPJ sem fantasia/sem razão → { tipo:'CNPJ_SEM_FANTASIA', campo:'NomeFantasia'|'Nome', mensagem:MSG_CNPJ } (SÓ AVISO)
 *   - ok, documento vazio/inválido → null
 * `bloqueia` NÃO é calculado aqui (depende da chave em AppConfig) — fica no service.
 */
function situacaoNomeCadastro({ documento, nome, nomeFantasia } = {}) {
    const v = validarNomeCadastro({ documento, nome, nomeFantasia });
    if (v.ok) return null;
    if (ehCpf(documento)) {
        return { tipo: 'CPF_NOME_UNICO', campo: 'Nome', mensagem: MSG_CPF };
    }
    const fantasia = String(nomeFantasia == null ? '' : nomeFantasia).trim();
    return { tipo: 'CNPJ_SEM_FANTASIA', campo: fantasia ? 'Nome' : 'NomeFantasia', mensagem: MSG_CNPJ };
}

module.exports = {
    MSG_CPF,
    MSG_CNPJ,
    contarPalavras,
    cpfComNomeIncompleto,
    validarNomeCadastro,
    situacaoNomeCadastro,
    documentoMudou,
};
