/**
 * DECISÃO DO NOME FINAL DE UM GRUPO DE GRAFIAS DE CIDADE.
 *
 * Vive aqui, e não dentro de `routes/adminExec.js`, por um motivo prático: esta é a
 * regra que decide como o nome de uma cidade vai ser REESCRITO no banco na Fase 1.
 * Enterrada no meio de uma rota de 10 mil linhas ela não tinha como ser testada — a
 * primeira versão do teste lia o texto do `adminExec.js` e rodava `eval`, o que
 * aprova uma CÓPIA do código e quebra em qualquer refatoração. Como módulo, a rota e
 * o teste (`scripts/teste-cidade-nome-final.js`) exercitam exatamente a MESMA função.
 *
 * É função PURA: não toca banco, não lê env, não conhece req/res.
 *
 * A REGRA, combinada com o dono:
 *   1. chave no dicionário -> nome oficial de lá        (não precisa aprovação)
 *      origemNomeFinal: 'dicionario'              · precisaAprovacao: false
 *   2. senão, o nome ACENTUADO mais frequente do grupo  (precisa aprovação)
 *      origemNomeFinal: 'maisFrequenteAcentuada'  · precisaAprovacao: true
 *      Atenção ao rótulo: é a mais frequente ENTRE AS ACENTUADAS, não no geral —
 *      "Itapoá" com 20 vence "ITAPOA" com 900 de propósito (o acento é o que
 *      o Title Case não consegue inventar). Não chamar isso de "maisFrequente":
 *      o dono lê este campo para decidir se confia na proposta.
 *   3. nenhuma acentuada, ou empate REAL -> Title Case da mais frequente
 *      origemNomeFinal: 'tituloAutomatico'        · precisaAprovacao: true
 * Title Case NUNCA inventa acento: "ITAPOA" vira "Itapoa". É exatamente por isso
 * que os casos 2 e 3 pedem aprovação e viram linha em CIDADES_CANONICAS.
 */
const { CIDADES_CANONICAS, temAcento, normalizarCidade } = require('./cidade');

/**
 * Ordem das grafias dentro de um grupo: mais frequente primeiro; empate desempata
 * pelo nome (`localeCompare` pt-BR) só para a saída ser estável entre execuções.
 * Cada item é `{ valor, total, ... }`.
 */
const porFrequencia = (a, b) => (b.total - a.total) || a.valor.localeCompare(b.valor, 'pt-BR');

/**
 * @param {string} chave      resultado de `chaveCidade(...)` — a chave do grupo
 * @param {Array<{valor: string, total: number}>} variantes  grafias cruas do grupo
 * @returns {{nomeFinal: string, origemNomeFinal: 'dicionario'|'maisFrequenteAcentuada'|'tituloAutomatico', precisaAprovacao: boolean}}
 */
function decidirNomeFinal(chave, variantes) {
    if (Object.prototype.hasOwnProperty.call(CIDADES_CANONICAS, chave)) {
        return { nomeFinal: CIDADES_CANONICAS[chave], origemNomeFinal: 'dicionario', precisaAprovacao: false };
    }
    const ordenadas = [...variantes].sort(porFrequencia);

    // As acentuadas são agrupadas pelo NOME NORMALIZADO antes de decidir, porque
    // "ITAPOÁ" e "Itapoá" são a MESMA proposta (as duas viram "Itapoá"). Comparar
    // a grafia CRUA fazia essas duas "empatarem" entre si, o código caía no
    // fallback e propunha a mais frequente no geral — a SEM acento, "Itapoa", a
    // terceira grafia errada que o dicionário existe para evitar. E o cenário é
    // o normal, não o raro: BrasilAPI devolve MAIÚSCULO e CNPJá devolve Title
    // Case (utils/cidade.js:10-12), alternando conforme qual respondeu.
    //
    // O agrupamento só funciona porque `normalizarCidade` fixa a forma Unicode em
    // NFC: sem isso "Itapoá" precomposto e "Itapoá" decomposto viravam DUAS chaves
    // deste Map — dois candidatos para o mesmo nome, empatando um com o outro e
    // caindo no Title Case sem acento. Mesmo estrago, disparado por codificação em
    // vez de caixa. Ver `fixarNFC` em `utils/cidade.js`.
    //
    // Map (não objeto) porque a chave é nome vindo do banco — "constructor",
    // "__proto__" e afins são só mais um nome aqui.
    const porNomeAcentuado = new Map();
    for (const v of ordenadas) {
        if (!temAcento(v.valor)) continue;
        const nome = normalizarCidade(v.valor);
        if (!nome) continue;                        // grafia só de espaço/pontuação
        const acumulado = porNomeAcentuado.get(nome);
        if (acumulado) acumulado.total += v.total;
        else porNomeAcentuado.set(nome, { nome, total: v.total });
    }
    const candidatos = [...porNomeAcentuado.values()]
        .sort((a, b) => (b.total - a.total) || a.nome.localeCompare(b.nome, 'pt-BR'));

    // Empate de verdade = dois nomes NORMALIZADOS DIFERENTES com o mesmo total
    // dentro do MESMO grupo — ou seja, que só diferem no acento, porque a chave do
    // grupo ignora acento: "Itapoá" 10 x "Itapoà" 10 (crase por engano de digitação).
    // Nomes de cidades diferentes ("Itapoá" x "Içara") NUNCA chegam aqui: são chaves
    // diferentes, grupos diferentes. Havendo empate o código não tem como escolher e
    // devolve o Title Case da mais frequente, com aprovação.
    const empateAcento = candidatos.length > 1 && candidatos[0].total === candidatos[1].total;
    if (candidatos.length && !empateAcento) {
        return {
            nomeFinal: candidatos[0].nome,
            origemNomeFinal: 'maisFrequenteAcentuada',
            precisaAprovacao: true,
        };
    }
    return {
        nomeFinal: normalizarCidade(ordenadas[0].valor),
        origemNomeFinal: 'tituloAutomatico',
        precisaAprovacao: true,
    };
}

module.exports = { porFrequencia, decidirNomeFinal };
