/**
 * TESTE das regras PURAS do backfill de cidades — Fase 2.
 *
 * NÃO toca no banco (o módulo carrega `config/database`, mas nenhuma consulta é feita:
 * só `classificarMudanca` e as funções de `utils/` são exercitadas aqui).
 * Uso:  node scripts/teste-backfill-cidades.js
 * Sai com código 1 se algum caso falhar.
 *
 * O que este teste protege
 * ------------------------
 * 1. IDEMPOTÊNCIA — a garantia central da Fase 2: rodar o backfill de novo tem que afetar
 *    0 linhas. Isso só vale enquanto `normalizarCidade(nomeFinal) === nomeFinal` para TODO
 *    nome final possível. Aqui a propriedade é verificada sobre o dicionário inteiro, então
 *    uma entrada nova mal digitada em `CIDADES_CANONICAS` (ex.: `'itapoa': 'ITAPOÁ'`)
 *    quebra o teste ANTES de virar um backfill que fica reescrevendo o banco em círculos.
 * 2. A TRAVA DE APROVAÇÃO — `classificarMudanca` é o que separa "o dono aprovou" de
 *    "o Title Case chutou". Se ela passar a classificar "SAO BENTO" como aprovada, o
 *    backfill grava "Sao Bento" em produção — uma terceira grafia errada, sem acento.
 * 3. A SENTINELA "Sem cidade" — as 2 linhas de `meta_cidades` que o dono mandou não tocar
 *    ficam paradas por causa do dicionário, NÃO por uma exceção escondida no backfill.
 */
const { normalizarCidade, CIDADES_CANONICAS } = require('../utils/cidade');
const { deduplicarMetasCidades } = require('../utils/metaCidadeMerge');
const { classificarMudanca } = require('../services/backfillCidadesService');

let ok = 0;
let falhas = 0;

function conferir(rotulo, obtido, esperado) {
    const igual = Object.is(obtido, esperado);
    if (igual) ok++; else falhas++;
    const mostra = (v) => (typeof v === 'string' ? JSON.stringify(v) : String(v));
    console.log(`${igual ? '  ok  ' : ' FALHA'} │ ${rotulo.padEnd(56)} → ${mostra(obtido)}${igual ? '' : `   (esperado ${mostra(esperado)})`}`);
}

console.log('\n=== 1) IDEMPOTÊNCIA: todo nome final é ponto fixo de normalizarCidade ===');
console.log('    (é o que faz "rodar o backfill de novo" afetar 0 linhas)');
for (const [chave, nome] of Object.entries(CIDADES_CANONICAS)) {
    conferir(`normalizarCidade(${JSON.stringify(nome)})  [chave ${chave}]`, normalizarCidade(nome), nome);
}
// Nomes que NÃO estão no dicionário também precisam ser ponto fixo, senão o backfill de
// uma cidade qualquer (Title Case puro) ficaria reescrevendo o mesmo registro toda vez.
for (const nome of ['Blumenau', 'Balneário Barra do Sul', 'Rio do Sul', 'Garuva', 'Navegantes',
    'São José dos Pinhais', 'Santa Bárbara d\'Oeste', 'Mogi-Guaçu']) {
    conferir(`normalizarCidade(${JSON.stringify(nome)})  [fora do dicionário]`, normalizarCidade(nome), nome);
}

console.log('\n=== 2) TRAVA DE APROVAÇÃO (classificarMudanca) ===');
console.log('    dicionario/espacos = aplica sozinho · tituloAutomatico = só com permissão explícita');
conferir("'JOINVILLE'      -> 'Joinville'", classificarMudanca('JOINVILLE', 'Joinville'), 'dicionario');
conferir("'ITAPOA'         -> 'Itapoá'    [acento que o dado perdeu]", classificarMudanca('ITAPOA', 'Itapoá'), 'dicionario');
conferir("'Joiville'       -> 'Joinville' [erro de digitação aprovado]", classificarMudanca('Joiville', 'Joinville'), 'dicionario');
conferir("'São Francisco ' -> 'São Francisco do Sul' [nome incompleto]", classificarMudanca('São Francisco ', 'São Francisco do Sul'), 'dicionario');
conferir("'Blumenau  '     -> 'Blumenau'  [só espaço sobrando]", classificarMudanca('Blumenau  ', 'Blumenau'), 'espacos');
conferir("'Rio  do  Sul'   -> 'Rio do Sul' [espaço duplo no meio]", classificarMudanca('Rio  do  Sul', 'Rio do Sul'), 'espacos');
// O caso perigoso: sem entrada no dicionário o Title Case NÃO devolve o acento perdido.
conferir("'SAO BENTO DO SUL' -> 'Sao Bento do Sul' [SEM acento!]", classificarMudanca('SAO BENTO DO SUL', 'Sao Bento do Sul'), 'tituloAutomatico');
conferir("'GARUVA'         -> 'Garuva'    [caixa, fora do dicionário]", classificarMudanca('GARUVA', 'Garuva'), 'tituloAutomatico');
conferir("  ... e 'Sao Bento do Sul' é mesmo o que sairia", normalizarCidade('SAO BENTO DO SUL'), 'Sao Bento do Sul');

console.log('\n=== 3) SENTINELA "Sem cidade" — as 2 linhas que o dono mandou NÃO tocar ===');
conferir("normalizarCidade('Sem cidade') é no-op", normalizarCidade('Sem cidade'), 'Sem cidade');
conferir('  ... logo o backfill não vê mudança nenhuma', normalizarCidade('Sem cidade') === 'Sem cidade', true);
conferir("sem a sentinela seria 'Sem Cidade' (cidade fantasma)", normalizarCidade('Sem cidade') === 'Sem Cidade', false);

console.log('\n=== 4) FUSÃO DE META — os 3 casos reais de produção, com os números aprovados ===');
console.log('    (mesma função da gravação: utils/metaCidadeMerge.deduplicarMetasCidades)');
{
    // Letícia Piske · 2026-08 · Joinville 107.132,05 + JOINVILLE 231,00
    const r = deduplicarMetasCidades([
        { cidade: 'Joinville', valor: 107132.05, diasSemana: 'N/D,SEG,TER,QUA,QUI,SEX' },
        { cidade: 'JOINVILLE', valor: 231.00, diasSemana: 'N/D' },
    ]).cidades;
    conferir('Letícia · 1 linha só', r.length, 1);
    conferir('Letícia · cidade', r[0].cidade, 'Joinville');
    conferir('Letícia · valor somado', r[0].valor, 107363.05);
    conferir('Letícia · dias unidos, N/D no fim', r[0].diasSemana, 'SEG,TER,QUA,QUI,SEX,N/D');
}
{
    // Jociel · 2026-08 · Joinville 19.545,02 + JOINVILLE 177,94
    const r = deduplicarMetasCidades([
        { cidade: 'Joinville', valor: 19545.02, diasSemana: 'SEG,QUA,QUI,SEX' },
        { cidade: 'JOINVILLE', valor: 177.94, diasSemana: 'QUA' },
    ]).cidades;
    conferir('Jociel/Joinville · valor somado', r[0].valor, 19722.96);
    conferir('Jociel/Joinville · dias', r[0].diasSemana, 'SEG,QUA,QUI,SEX');
}
{
    // Jociel · 2026-08 · Itapoá 6.403,04 + ITAPOA 243,22
    const r = deduplicarMetasCidades([
        { cidade: 'Itapoá', valor: 6403.04, diasSemana: 'SEG' },
        { cidade: 'ITAPOA', valor: 243.22, diasSemana: 'SEG' },
    ]).cidades;
    conferir('Jociel/Itapoá · cidade com acento', r[0].cidade, 'Itapoá');
    conferir('Jociel/Itapoá · valor somado (sem 6646.259999…)', r[0].valor, 6646.26);
}
{
    // Colisão que vem de APELIDO do dicionário: "Joinvile" e "Joinville" são CHAVES
    // DIFERENTES e mesmo assim viram a mesma linha. Agrupar por chaveCidade deixaria passar
    // e o UPDATE estouraria o @@unique([metaMensalVendedorId, cidade]) em produção.
    const r = deduplicarMetasCidades([
        { cidade: 'Joinville', valor: 1000, diasSemana: 'TER' },
        { cidade: 'Joinvile', valor: 250, diasSemana: 'SEX' },
    ]).cidades;
    conferir('apelido funde com a cidade principal', r.length, 1);
    conferir('  ... valor somado', r[0].valor, 1250);
    conferir('  ... dias unidos na ordem da semana', r[0].diasSemana, 'TER,SEX');
}

console.log('\n=== 5) O que o backfill NÃO deve mexer ===');
conferir("valor só com espaço vira null (não é mudança, é descarte)", normalizarCidade('   '), null);
conferir('cidade já oficial não muda', normalizarCidade('Joinville'), 'Joinville');
conferir('cidade já oficial com acento não muda', normalizarCidade('Itapoá'), 'Itapoá');
conferir('São Francisco do Sul completo não muda', normalizarCidade('São Francisco do Sul'), 'São Francisco do Sul');

console.log('\n──────────────────────────────────────────────────────────────');
console.log(`${falhas === 0 ? '✅' : '❌'}  ${ok} passaram, ${falhas} falharam.`);
process.exit(falhas === 0 ? 0 : 1);
