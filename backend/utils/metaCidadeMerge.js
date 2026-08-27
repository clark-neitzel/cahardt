/**
 * FUSÃO DE LINHAS DE `meta_cidades` QUE VIRAM A MESMA CIDADE.
 *
 * POR QUE EXISTE
 * --------------
 * `meta_cidades` tem `@@unique([metaMensalVendedorId, cidade])` (schema.prisma:2048).
 * Hoje, como a cidade é gravada crua, a MESMA meta consegue ter duas linhas para a
 * mesma cidade — "Joinville" e "JOINVILLE" são strings diferentes para o Postgres,
 * então o índice único deixa passar. Em produção (08/2026) havia 3 casos assim.
 *
 * A partir da Fase 1 a cidade é NORMALIZADA antes de gravar. Isso conserta o cadastro
 * novo e, de quebra, cria uma regressão se ninguém tratar: as duas linhas passam a ter
 * o MESMO nome, o `createMany` viola o índice único e **a meta deixa de salvar (500)**.
 * O dedupe da tela (`MetaFormModal.jsx`) é de UI e não protege a API — qualquer payload
 * montado fora da tela (script, integração, formulário antigo aberto) chega assim.
 *
 * A REGRA, aprovada pelo dono no diagnóstico:
 *   · valor  -> SOMA das linhas. Não é "ficar com a maior": a meta da cidade é UMA só,
 *               e escolher a maior APAGARIA meta de verdade e mudaria o bônus do vendedor.
 *   · dias   -> UNIÃO, na ordem canônica da semana. Dia desconhecido (o banco tem
 *               "N/D" em duas linhas reais) é preservado e vai para o FIM — jogar fora
 *               seria perder dado, e ordenar junto embaralharia a semana.
 *   · nome   -> `normalizarCidade` da primeira ocorrência (todas dão o mesmo nome, é a
 *               definição de estarem no mesmo grupo).
 *
 * Função PURA: não toca banco, não lê env. Testada em `scripts/teste-cidade.js`.
 * Usada por `services/metaService.js` (gravação) e por `routes/adminExec.js`
 * (diagnóstico) — a mesma regra nos dois lados, para o que o dono aprova na lista ser
 * exatamente o que o backfill da Fase 2 vai gravar.
 */
const { chaveCidade, normalizarCidade } = require('./cidade');

/** Ordem canônica dos dias de entrega. O que não estiver aqui é "desconhecido". */
const ORDEM_DIAS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];

/**
 * União de listas de dias ("SEG,QUI" + "QUI,SEX" -> "SEG,QUI,SEX").
 * Aceita string separada por vírgula, null/undefined ou array. Sem dia nenhum -> null.
 * Desconhecidos ("N/D") são preservados, em ordem alfabética, DEPOIS dos dias da semana.
 */
function unirDiasSemana(entradas) {
    const dias = new Set();
    for (const entrada of [].concat(entradas || [])) {
        for (const pedaco of String(entrada == null ? '' : entrada).split(',')) {
            const dia = pedaco.trim().toUpperCase();
            if (dia) dias.add(dia);
        }
    }
    const conhecidos = ORDEM_DIAS.filter(d => dias.has(d));
    const desconhecidos = [...dias].filter(d => !ORDEM_DIAS.includes(d)).sort();
    return [...conhecidos, ...desconhecidos].join(',') || null;
}

/**
 * Deduplica a lista de metas por cidade que veio do formulário, ANTES do `createMany`.
 *
 * Entrada:  [{ cidade, valor, diasSemana }, ...]  (cidade crua, como o usuário digitou)
 * Saída:    [{ cidade, valor, diasSemana }, ...]  (cidade normalizada, uma por cidade)
 *
 * A ordem da primeira aparição é preservada — a tela lista as cidades na ordem em que
 * foram adicionadas e reordenar sem motivo confunde quem acabou de salvar.
 *
 * Linha SEM cidade (vazia, só espaço, null) é DESCARTADA: `meta_cidades.cidade` é NOT
 * NULL e uma meta de cidade sem cidade não tem como ser casada com pedido nenhum
 * (`comissaoService` faz lookup exato pelo nome). Devolvemos quantas foram descartadas
 * para quem chamou poder logar — nunca some em silêncio.
 */
function deduplicarMetasCidades(lista) {
    const porChave = new Map();
    let descartadasSemCidade = 0;

    for (const item of (Array.isArray(lista) ? lista : [])) {
        const nome = normalizarCidade(item?.cidade);
        if (!nome) { descartadasSemCidade++; continue; }
        // A chave é a do NOME FINAL, não a da cidade crua: os apelidos de
        // CIDADES_CANONICAS fundem chaves diferentes ("Joiville" e "Joinville" viram
        // as duas "Joinville"). Usar a chave crua deixaria as duas passarem e o
        // @@unique estouraria exatamente como antes.
        const chave = chaveCidade(nome);
        const valor = Number(item?.valor) || 0;
        const existente = porChave.get(chave);
        if (existente) {
            existente.valor += valor;
            existente.dias.push(item?.diasSemana);
        } else {
            porChave.set(chave, { cidade: nome, valor, dias: [item?.diasSemana] });
        }
    }

    const cidades = [...porChave.values()].map(c => ({
        cidade: c.cidade,
        // Centavos: a soma de dois floats vindos de JSON produz 6646.259999999999.
        valor: Math.round(c.valor * 100) / 100,
        diasSemana: unirDiasSemana(c.dias),
    }));
    return { cidades, descartadasSemCidade };
}

module.exports = { ORDEM_DIAS, unirDiasSemana, deduplicarMetasCidades };
