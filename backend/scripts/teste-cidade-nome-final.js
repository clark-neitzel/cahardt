/**
 * TESTE de `utils/cidadeNomeFinal.js` — a REGRA QUE DECIDE COMO A CIDADE SERÁ REESCRITA.
 *
 * NÃO toca no banco, não lê env, não escreve nada — é só função pura.
 * Uso:  node scripts/teste-cidade-nome-final.js
 * Sai com código 1 se algum caso falhar (dá para plugar em CI depois).
 * Irmão de `scripts/teste-cidade.js`, que cobre o utilitário de grafia (`utils/cidade.js`).
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * ---------------------------
 * `decidirNomeFinal` é a função que a Fase 1 vai usar para REESCREVER nome de cidade em
 * seis tabelas de produção. Ela morava dentro de `routes/adminExec.js`, no meio de uma
 * rota de milhares de linhas, e por isso não tinha como ser testada — a primeira tentativa
 * de teste lia o TEXTO do arquivo e rodava `eval`, o que aprova uma cópia e quebra em
 * qualquer refatoração. A função foi extraída para módulo próprio justamente para que a
 * rota e este teste exercitem a MESMA função.
 *
 * O defeito que motivou o teste (e que os casos 2 e 5 travam para sempre): quando as
 * grafias acentuadas eram comparadas CRUAS, "ITAPOÁ" e "Itapoá" — que são a mesma
 * proposta, as duas viram "Itapoá" — empatavam UMA COM A OUTRA. O código lia isso como
 * "não sei decidir", caía no Title Case da mais frequente no geral e propunha "Itapoa",
 * SEM acento: uma terceira grafia errada, gravada em cima do dado bom.
 */
const { decidirNomeFinal, porFrequencia } = require('../utils/cidadeNomeFinal');
const { chaveCidade, normalizarCidade, CIDADES_CANONICAS } = require('../utils/cidade');

let ok = 0;
let falhas = 0;

function conferir(rotulo, obtido, esperado) {
    const igual = Object.is(obtido, esperado);
    if (igual) ok++; else falhas++;
    const mostra = (v) => (typeof v === 'string' ? JSON.stringify(v) : String(v));
    console.log(`${igual ? '  ok  ' : ' FALHA'} │ ${rotulo.padEnd(58)} → ${mostra(obtido)}${igual ? '' : `   (esperado ${mostra(esperado)})`}`);
}

/**
 * Monta o grupo do jeito que a rota monta e chama a decisão.
 * A rota passa variantes com um contador por fonte (clientes, leads...), mas
 * `decidirNomeFinal` só olha `valor` e `total` — o resto é irrelevante aqui.
 * A chave é derivada de verdade por `chaveCidade`, como na rota (não é chute).
 */
function decidir(pares) {
    const variantes = pares.map(([valor, total]) => ({ valor, total }));
    const chave = chaveCidade(variantes[0].valor);
    return decidirNomeFinal(chave, variantes);
}

/**
 * Roda um bloco COM AS CHAVES INDICADAS FORA do dicionário, e devolve o dicionário ao
 * estado original no `finally`.
 *
 * POR QUE PRECISOU EXISTIR NA FASE 1
 * ----------------------------------
 * Na Fase 0 o dicionário era vazio, então "ITAPOA"/"JOINVILLE" eram exemplos perfeitos
 * para exercitar a REGRA de decisão. Na Fase 1 as duas viraram entrada do dicionário —
 * e o dicionário GANHA de tudo (é o passo 1 de `decidirNomeFinal`). Sem este helper, os
 * blocos abaixo passariam a testar "o dicionário funciona" em vez da regra, e o defeito
 * histórico que eles travam (as acentuadas empatando entre si e a proposta caindo para
 * "Itapoa", sem acento) ficaria SEM TESTE — livre para voltar na primeira cidade nova
 * que aparecer no banco.
 *
 * Ou seja: os blocos continuam valendo para toda cidade que AINDA NÃO está no dicionário,
 * que é o caso de 103 - 19 = 84 das cidades de produção e de qualquer cidade futura.
 * O caminho do dicionário é testado à parte, no bloco "as 3 origens".
 */
function semDicionario(chaves, fn) {
    // Guarda o objeto INTEIRO, na ordem original. Só repor as chaves apagadas no fim as
    // jogaria para o final do objeto — `JSON.stringify(CIDADES_CANONICAS)` mudaria e o
    // teste que trava a lista aprovada (em teste-cidade.js) passaria a depender de qual
    // bloco rodou antes. Restaurar a ordem elimina essa armadilha.
    const original = Object.entries(CIDADES_CANONICAS);
    for (const chave of chaves) delete CIDADES_CANONICAS[chave];
    try {
        return fn();
    } finally {
        for (const chave of Object.keys(CIDADES_CANONICAS)) delete CIDADES_CANONICAS[chave];
        for (const [chave, valor] of original) CIDADES_CANONICAS[chave] = valor;
    }
}

// Formas Unicode escritas com escape DE PROPÓSITO: em NFC o "á" é um caractere só
// (U+00E1) e em NFD são dois ("a" + U+0301). No editor as duas linhas ficariam
// IDÊNTICAS e ninguém entenderia o teste — nem veria se alguém trocasse uma pela outra.
const NFC = 'Itapo\u00e1';        // Itapoá — "á" precomposto, UM caractere
const NFD = 'Itapoa\u0301';       // Itapoá — "a" + U+0301, DOIS caracteres

console.log('\n=== o caso real: MAIÚSCULA sem acento em massa x acentuada minoritária ===');
// "ITAPOA" 900 é o volume da BrasilAPI (devolve MAIÚSCULO); as acentuadas são poucas.
// O acento vence o volume de propósito: Title Case não inventa acento, então perder o
// acento aqui seria perder informação que o dado bom ainda tem.
semDicionario(['itapoa'], () => {
    const r = decidir([['ITAPOA', 900], ['ITAPOÁ', 11], ['Itapoá', 10]]);
    conferir('ITAPOA 900 + ITAPOÁ 11 + Itapoá 10 → nomeFinal', r.nomeFinal, 'Itapoá');
    conferir('  ... origemNomeFinal', r.origemNomeFinal, 'maisFrequenteAcentuada');
    conferir('  ... precisaAprovacao', r.precisaAprovacao, true);
});

console.log('\n=== O CASO QUE FALHAVA: as duas acentuadas EMPATADAS entre si ===');
// ITAPOÁ 10 e Itapoá 10. Comparadas CRUAS elas empatam, o código achava que não sabia
// decidir e caía no fallback → "Itapoa" SEM acento. Agrupadas pelo NOME NORMALIZADO
// viram um candidato só, "Itapoá" com 20, que ganha do fallback com folga.
semDicionario(['itapoa'], () => {
    const r = decidir([['ITAPOA', 900], ['ITAPOÁ', 10], ['Itapoá', 10]]);
    conferir('ITAPOA 900 + ITAPOÁ 10 + Itapoá 10 → nomeFinal', r.nomeFinal, 'Itapoá');
    conferir('  ... NÃO caiu no Title Case sem acento', r.nomeFinal !== 'Itapoa', true);
    conferir('  ... origemNomeFinal', r.origemNomeFinal, 'maisFrequenteAcentuada');
});

console.log('\n=== NFC × NFD: mesmo nome NÃO pode virar dois candidatos ===');
// Mesmo defeito do bloco acima, disparado por CODIFICAÇÃO em vez de caixa: as duas
// grafias abaixo são idênticas na tela e diferentes para o `===` do JavaScript. Sem o
// `.normalize('NFC')` de `normalizarCidade` elas viravam DUAS chaves do Map de
// candidatos, empatavam 10 x 10 e a proposta caía para "Itapoa", sem acento.
conferir('as duas entradas são strings DIFERENTES p/ o JS', NFC === NFD, false);
conferir('  ... mas o mesmo texto (localeCompare pt-BR = 0)', NFC.localeCompare(NFD, 'pt-BR'), 0);
semDicionario(['itapoa'], () => {
    const r = decidir([['ITAPOA', 900], [NFC, 10], [NFD, 10]]);
    conferir('ITAPOA 900 + NFC 10 + NFD 10 → nomeFinal', r.nomeFinal, 'Itapoá');
    conferir('  ... saiu em NFC', r.nomeFinal === r.nomeFinal.normalize('NFC'), true);
    conferir('  ... um candidato só (não empatou consigo mesmo)', r.origemNomeFinal, 'maisFrequenteAcentuada');
});
semDicionario(['itapoa'], () => {
    // Sem nenhuma grafia sem acento no grupo, o resultado tem que ser o mesmo.
    const r = decidir([[NFD, 7], [NFC, 3]]);
    conferir('só NFD 7 + NFC 3 → nomeFinal (uma proposta só)', r.nomeFinal, 'Itapoá');
    conferir('  ... origemNomeFinal', r.origemNomeFinal, 'maisFrequenteAcentuada');
});

console.log('\n=== empate REAL: dois nomes normalizados DIFERENTES no mesmo grupo ===');
// Só entram no mesmo grupo nomes com a MESMA chave (sem acento): "Itapoá" e "Itapoã"
// diferem apenas no acento, então competem de verdade. ("Itapoá" x "Içara" NUNCA
// competem — chaves diferentes, grupos diferentes.) Empatados, o código não tem como
// escolher e devolve o Title Case da mais frequente, pedindo aprovação do dono.
conferir('Itapoá e Itapoã caem no MESMO grupo', chaveCidade('Itapoá') === chaveCidade('Itapoã'), true);
conferir('Itapoá e Içara caem em grupos DIFERENTES', chaveCidade('Itapoá') === chaveCidade('Içara'), false);
semDicionario(['itapoa'], () => {
    const r = decidir([['Itapoá', 10], ['Itapoã', 10]]);
    conferir('Itapoá 10 x Itapoã 10 → origemNomeFinal', r.origemNomeFinal, 'tituloAutomatico');
    conferir('  ... precisaAprovacao (o dono decide)', r.precisaAprovacao, true);
    // Qual dos dois sai é o desempate por `localeCompare` pt-BR, que depende da versão do
    // ICU do Node — o teste exige que seja UM DOS DOIS e que seja SEMPRE O MESMO, em vez
    // de gravar na pedra uma ordem que pode mudar com a versão do Node.
    conferir('  ... nomeFinal é uma das duas grafias', ['Itapoá', 'Itapoã'].includes(r.nomeFinal), true);
    conferir('  ... decisão estável (2ª chamada dá o mesmo)', decidir([['Itapoã', 10], ['Itapoá', 10]]).nomeFinal, r.nomeFinal);
});
semDicionario(['itapoa'], () => {
    // Desempatado por 1 registro, já não é empate: a mais frequente ganha.
    const r = decidir([['Itapoá', 11], ['Itapoã', 10]]);
    conferir('Itapoá 11 x Itapoã 10 → nomeFinal', r.nomeFinal, 'Itapoá');
    conferir('  ... origemNomeFinal', r.origemNomeFinal, 'maisFrequenteAcentuada');
});

console.log('\n=== as 3 origens de origemNomeFinal ===');
{
    // 1) dicionario — na FASE 1 'itapoa' É uma entrada real do dicionário (aprovada pelo
    //    dono). É o caminho que devolve `precisaAprovacao: false` e o único que consegue
    //    devolver o acento que o dado perdeu: 900 registros "ITAPOA" não vencem a linha.
    const r = decidir([['ITAPOA', 900], ['Itapoa', 5]]);
    conferir('1) dicionário manda, mesmo com 900 sem acento', r.nomeFinal, 'Itapoá');
    conferir('   ... origemNomeFinal', r.origemNomeFinal, 'dicionario');
    conferir('   ... precisaAprovacao (o dono JÁ aprovou)', r.precisaAprovacao, false);
    // E o APELIDO — chave própria ('joiville'), nome final de outra cidade. É o único
    // mecanismo do sistema que junta chaves diferentes.
    const rApelido = decidirNomeFinal(chaveCidade('Joiville'), [{ valor: 'Joiville', total: 4 }]);
    conferir('1) apelido do dicionário → nomeFinal', rApelido.nomeFinal, 'Joinville');
    conferir('   ... origemNomeFinal', rApelido.origemNomeFinal, 'dicionario');
    conferir('   ... precisaAprovacao', rApelido.precisaAprovacao, false);
    conferir('   ... e a chave do grupo continua sendo a do apelido', chaveCidade('Joiville'), 'joiville');
}
semDicionario(['joinville', 'balneario camboriu'], () => {
    // 2) maisFrequenteAcentuada
    const r = decidir([['JOINVILLE', 500], ['Joinville', 3]]);
    conferir('2) sem acento nenhum → origemNomeFinal', r.origemNomeFinal, 'tituloAutomatico');
    const r2 = decidir([['BALNEARIO CAMBORIU', 80], ['Balneário Camboriú', 4]]);
    conferir('2) uma acentuada só → nomeFinal', r2.nomeFinal, 'Balneário Camboriú');
    conferir('   ... origemNomeFinal', r2.origemNomeFinal, 'maisFrequenteAcentuada');
    conferir('   ... precisaAprovacao', r2.precisaAprovacao, true);
});
semDicionario(['itapoa'], () => {
    // 3) tituloAutomatico — nenhuma grafia do grupo tem acento; o Title Case é tudo que
    //    sobra e NÃO inventa o acento que falta. É por isso que precisa de aprovação.
    const r = decidir([['ITAPOA', 900], ['itapoa', 5]]);
    conferir('3) nenhuma acentuada → nomeFinal (sem acento mesmo)', r.nomeFinal, 'Itapoa');
    conferir('   ... origemNomeFinal', r.origemNomeFinal, 'tituloAutomatico');
    conferir('   ... precisaAprovacao', r.precisaAprovacao, true);
});

console.log('\n=== grafia única (o grupo que não colide) ===');
semDicionario(['joinville', 'itapoa'], () => {
    const r = decidir([['JOINVILLE', 42]]);
    conferir("grafia única 'JOINVILLE' → nomeFinal", r.nomeFinal, 'Joinville');
    conferir('  ... origemNomeFinal', r.origemNomeFinal, 'tituloAutomatico');
    const r2 = decidir([['Itapoá', 42]]);
    conferir("grafia única 'Itapoá' → nomeFinal", r2.nomeFinal, 'Itapoá');
    conferir('  ... origemNomeFinal', r2.origemNomeFinal, 'maisFrequenteAcentuada');
});

console.log('\n=== a decisão não pode ser reescrita pelo dado do banco ===');
{
    // O nome vem do banco: "constructor", "__proto__" e afins são só mais um nome. Se o
    // agrupamento usasse objeto no lugar de Map, estes casos achariam método do
    // Object.prototype e devolveriam uma função no lugar do nome da cidade.
    const r = decidir([['CONSTRUCTOR', 9], ['Constructör', 4]]);
    conferir("grupo 'constructor' devolve string", typeof r.nomeFinal, 'string');
    conferir('  ... e é o nome, não um método', r.nomeFinal, 'Constructör');
    const r2 = decidir([['__PROTO__', 9], ['__prótó__', 4]]);
    conferir("grupo '__proto__' devolve string", typeof r2.nomeFinal, 'string');
}

console.log('\n=== a entrada não é modificada (a rota reusa a mesma lista depois) ===');
{
    // A rota ordena `variantes` e passa a MESMA lista adiante para montar a resposta.
    // Se `decidirNomeFinal` ordenasse no lugar, mexeria em dado de quem chamou.
    const variantes = [{ valor: 'ITAPOA', total: 900 }, { valor: 'Itapoá', total: 10 }];
    const copia = variantes.map(v => v.valor);
    decidirNomeFinal(chaveCidade('ITAPOA'), variantes);
    conferir('ordem da lista original preservada', JSON.stringify(variantes.map(v => v.valor)), JSON.stringify(copia));
    conferir('totais não foram somados na lista original', variantes[1].total, 10);
}

console.log('\n=== porFrequencia (a ordenação que a rota também usa) ===');
{
    const l = [{ valor: 'B', total: 1 }, { valor: 'A', total: 9 }, { valor: 'A2', total: 1 }].sort(porFrequencia);
    conferir('mais frequente primeiro', l[0].valor, 'A');
    conferir('empate desempata por nome (saída estável)', `${l[1].valor},${l[2].valor}`, 'A2,B');
}

console.log('\n=== idempotência: o nome proposto já é a forma final ===');
{
    // O nome final vai ser GRAVADO. Rodar o diagnóstico de novo, depois do backfill,
    // tem que propor exatamente o mesmo nome — senão a Fase 1 reescreveria para sempre.
    for (const pares of [
        [['ITAPOA', 900], ['ITAPOÁ', 10], ['Itapoá', 10]],
        [['JOINVILLE', 500], ['Joinville ', 9]],
        [['SAO FRANCISCO DO SUL', 30]],
    ]) {
        const r = decidir(pares);
        conferir(`normalizarCidade(${JSON.stringify(r.nomeFinal)}) === ele mesmo`, normalizarCidade(r.nomeFinal), r.nomeFinal);
        conferir(`  ... e decidir de novo dá o mesmo`, decidir([[r.nomeFinal, 1]]).nomeFinal, r.nomeFinal);
    }
}


console.log('\n=== FASE 1: o dicionário FUNDE chaves — dois grupos, um nome final ===');
// Este é o efeito que o relatório do diag-cidades precisa mostrar: "Joiville" continua
// sendo um GRUPO à parte (chave própria), mas some dentro de "Joinville" no backfill.
// Se o dono ler o relatório sem essa sinalização, acha que Joiville é outra cidade.
{
    const grupoOficial = decidirNomeFinal(chaveCidade('Joinville'), [{ valor: 'JOINVILLE', total: 12 }]);
    const grupoApelido = decidirNomeFinal(chaveCidade('Joiville'), [{ valor: 'Joiville', total: 4 }]);
    conferir('chaves diferentes', chaveCidade('Joinville') === chaveCidade('Joiville'), false);
    conferir('  ... mas o MESMO nome final', grupoOficial.nomeFinal === grupoApelido.nomeFinal, true);
    conferir('  ... que é Joinville', grupoApelido.nomeFinal, 'Joinville');
}
{
    // O outro apelido aprovado: nome incompleto no cadastro.
    const r = decidirNomeFinal(chaveCidade('São Francisco '), [{ valor: 'São Francisco ', total: 2 }]);
    conferir("'São Francisco ' → nomeFinal", r.nomeFinal, 'São Francisco do Sul');
    conferir('  ... chave do grupo continua a curta', chaveCidade('São Francisco '), 'sao francisco');
    conferir('  ... não pede aprovação (o dono já decidiu)', r.precisaAprovacao, false);
}

console.log('\n=== FASE 1: "Sem cidade" — o backfill NÃO pode encostar nessas 2 linhas ===');
{
    // Sem a linha do dicionário, o Title Case proporia "Sem Cidade" (C maiúsculo) e o
    // backfill reescreveria as duas linhas de meta_cidades, criando uma cidade fantasma.
    const r = decidirNomeFinal(chaveCidade('Sem cidade'), [{ valor: 'Sem cidade', total: 2 }]);
    conferir('nomeFinal é o texto EXATO que já está no banco', r.nomeFinal, 'Sem cidade');
    conferir('  ... ou seja, a variante NÃO muda (backfill = no-op)', r.nomeFinal === 'Sem cidade', true);
    conferir('  ... e não pede aprovação (é decisão registrada, não proposta)', r.precisaAprovacao, false);
    // A prova de que a linha do dicionário é o que segura isso:
    const semDic = semDicionario(['sem cidade'], () =>
        decidirNomeFinal(chaveCidade('Sem cidade'), [{ valor: 'Sem cidade', total: 2 }]));
    conferir('SEM a linha do dicionário viraria "Sem Cidade"', semDic.nomeFinal, 'Sem Cidade');
}

console.log('\n=== FASE 1: as 12 cidades aprovadas não pedem mais aprovação ===');
// `precisaAprovacao: false` é o que diz ao dono "esta linha já foi decidida por você".
// Se alguma voltar a `true`, é porque a entrada do dicionário sumiu ou a chave não bate.
for (const [bruto, esperado] of [
    ['JOINVILLE', 'Joinville'], ['JARAGUA DO SUL', 'Jaraguá do Sul'], ['ITAJAI', 'Itajaí'],
    ['ITAPOA', 'Itapoá'], ['CAMBORIU', 'Camboriú'], ['Araquari ', 'Araquari'],
    ['Guaramirim ', 'Guaramirim'], ['Barra velha ', 'Barra Velha'],
    ['Balneário piçarras ', 'Balneário Piçarras'], ['LUIZ ALVES', 'Luiz Alves'],
    ['SALVADOR', 'Salvador'], ['SAO FRANCISCO DO SUL', 'São Francisco do Sul'],
]) {
    const r = decidirNomeFinal(chaveCidade(bruto), [{ valor: bruto, total: 1 }]);
    conferir(`${JSON.stringify(bruto)} → ${JSON.stringify(esperado)} sem pedir aprovação`,
        `${r.nomeFinal}|${r.precisaAprovacao}`, `${esperado}|false`);
}

console.log('\n=== o helper semDicionario devolve o dicionário intacto ===');
// Se ele vazasse, os testes seguintes rodariam com o dicionário mutilado e passariam/
// falhariam por motivo errado — e pior, sem ninguém entender por quê.
{
    const antes = JSON.stringify(CIDADES_CANONICAS);
    semDicionario(['itapoa', 'joinville'], () => {
        conferir('dentro do bloco a chave sumiu',
            Object.prototype.hasOwnProperty.call(CIDADES_CANONICAS, 'itapoa'), false);
    });
    conferir('depois do bloco o dicionário está idêntico', JSON.stringify(CIDADES_CANONICAS), antes);
    // Mesmo se o bloco EXPLODIR, o finally restaura.
    try { semDicionario(['itapoa'], () => { throw new Error('erro de propósito'); }); } catch { /* esperado */ }
    conferir('  ... e restaura até quando o bloco lança erro', JSON.stringify(CIDADES_CANONICAS), antes);
    conferir('  ... chave que não existe no dicionário não quebra o helper',
        semDicionario(['cidade que nao existe'], () => 'ok'), 'ok');
}

console.log(`\n──────────────────────────────────────────────────────────────`);
console.log(`${falhas === 0 ? '✅' : '❌'}  ${ok} passaram, ${falhas} falharam.`);
process.exit(falhas === 0 ? 0 : 1);
