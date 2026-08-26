/**
 * TESTE do utilitário `utils/cidade.js` (padronização de grafia de cidade — Fase 0).
 *
 * NÃO toca no banco, não lê env, não escreve nada — é só função pura.
 * Uso:  node scripts/teste-cidade.js
 * Sai com código 1 se algum caso falhar (dá para plugar em CI depois).
 */
const { chaveCidade, normalizarCidade, temAcento, CIDADES_CANONICAS } = require('../utils/cidade');

let ok = 0;
let falhas = 0;

function conferir(rotulo, obtido, esperado) {
    const igual = Object.is(obtido, esperado);
    if (igual) ok++; else falhas++;
    const mostra = (v) => (typeof v === 'string' ? JSON.stringify(v) : String(v));
    console.log(`${igual ? '  ok  ' : ' FALHA'} │ ${rotulo.padEnd(46)} → ${mostra(obtido)}${igual ? '' : `   (esperado ${mostra(esperado)})`}`);
}

console.log('\n=== chaveCidade — forma de COMPARAÇÃO (nunca gravar) ===');
conferir("chaveCidade('ITAPOA')            [caixa alta]", chaveCidade('ITAPOA'), 'itapoa');
conferir("chaveCidade('Itapoá')            [com acento]", chaveCidade('Itapoá'), 'itapoa');
conferir("chaveCidade('  itapoa  ')        [espaço nas bordas]", chaveCidade('  itapoa  '), 'itapoa');
conferir("chaveCidade('SÃO  FRANCISCO')    [espaço duplo]", chaveCidade('SÃO  FRANCISCO'), 'sao francisco');
conferir("chaveCidade('Balneário Camboriú')", chaveCidade('Balneário Camboriú'), 'balneario camboriu');
conferir("chaveCidade('Içara')             [cedilha]", chaveCidade('Içara'), 'icara');
conferir("chaveCidade('Joinville\\tSC')      [tab]", chaveCidade('Joinville\tSC'), 'joinville sc');
conferir("chaveCidade('')                  [vazio]", chaveCidade(''), '');
conferir("chaveCidade('   ')               [só espaços]", chaveCidade('   '), '');
conferir("chaveCidade(null)                [nulo]", chaveCidade(null), '');
conferir("chaveCidade(undefined)           [indefinido]", chaveCidade(undefined), '');
conferir("chaveCidade(123)                 [número]", chaveCidade(123), '123');

console.log('\n=== a trava do "Sem cidade" (adminDashboard.js / dashboards.js) ===');
conferir("chaveCidade('') é FALSY (não vira grupo)", !chaveCidade(''), true);
conferir("chaveCidade('  ') é FALSY", !chaveCidade('  '), true);
conferir("chaveCidade(null) é FALSY", !chaveCidade(null), true);
conferir("normalizarCidade('') NÃO vira 'Sem Cidade'", normalizarCidade(''), null);

console.log('\n=== normalizarCidade — forma de GRAVAÇÃO ===');
conferir("normalizarCidade('JOINVILLE')     [caixa alta]", normalizarCidade('JOINVILLE'), 'Joinville');
conferir("normalizarCidade('joinville')     [minúscula]", normalizarCidade('joinville'), 'Joinville');
conferir("normalizarCidade('  Joinville  ') [espaço nas bordas]", normalizarCidade('  Joinville  '), 'Joinville');
conferir("normalizarCidade('SãO  FrANCISCO  DO  SUL')", normalizarCidade('SãO  FrANCISCO  DO  SUL'), 'São Francisco do Sul');
conferir("normalizarCidade('ITAPOA')        [acento PERDIDO no dado]", normalizarCidade('ITAPOA'), 'Itapoa');
conferir("normalizarCidade('Itapoá')        [acento preservado]", normalizarCidade('Itapoá'), 'Itapoá');

console.log('\n=== FORMA UNICODE: NFC × NFD (o mesmo nome escrito de dois jeitos) ===');
// Escapes DE PROPÓSITO: no editor as duas constantes ficariam IDÊNTICAS e ninguém
// entenderia o teste — nem veria se alguém trocasse uma pela outra.
//   NFC → "á" é UM caractere  (U+00E1)
//   NFD → "á" são DOIS        ("a" + U+0301, o acento combinante)
// Para o olho são iguais; para o `===` do JavaScript, não. E `===` é como o sistema casa
// cidade (`realizadoPorCidade[mc.cidade]` em comissaoService), por isso `normalizarCidade`
// — que é a função de GRAVAÇÃO — fixa a forma. Ver `fixarNFC` em utils/cidade.js.
const ITAPOA_NFC = 'Itapo\u00e1';
const ITAPOA_NFD = 'Itapoa\u0301';
conferir('as duas entradas são DIFERENTES para o ===', ITAPOA_NFC === ITAPOA_NFD, false);
conferir('  ... mas são o mesmo TEXTO (localeCompare pt-BR)', ITAPOA_NFC.localeCompare(ITAPOA_NFD, 'pt-BR'), 0);
// O teste que importa: === estrito, não localeCompare. localeCompare devolveria 0 mesmo
// com o bug — é justamente por isso que o problema não aparecia olhando a tela.
conferir('normalizarCidade(NFC) === normalizarCidade(NFD)', normalizarCidade(ITAPOA_NFC) === normalizarCidade(ITAPOA_NFD), true);
conferir('normalizarCidade(NFD) sai em NFC', normalizarCidade(ITAPOA_NFD), 'Itapo\u00e1');
conferir('  ... e tem 6 caracteres, não 7', normalizarCidade(ITAPOA_NFD).length, 6);
conferir('normalizarCidade(NFC) sai em NFC (não mexeu no que já estava certo)', normalizarCidade(ITAPOA_NFC), 'Itapo\u00e1');
conferir("MAIÚSCULA em NFD também sai em NFC", normalizarCidade('ITAPOA\u0301'), 'Itapo\u00e1');
conferir('nome composto em NFD sai todo em NFC', normalizarCidade('BALNEA\u0301RIO CAMBORIU\u0301'), 'Balneário Camboriú');
conferir('cedilha (ç) decomposto também é recomposto', normalizarCidade('Ic\u0327ara'), 'Içara');
conferir('a saída é sempre igual à própria forma NFC', normalizarCidade('SA\u0303O FRANCISCO'), normalizarCidade('SA\u0303O FRANCISCO').normalize('NFC'));
conferir('vazio continua null (o NFC não pode criar string)', normalizarCidade(''), null);
conferir('null continua null', normalizarCidade(null), null);
conferir("só o acento combinante solto (sem letra) continua null? não — é texto", normalizarCidade('\u0301'), '\u0301');

console.log('\n=== o caminho do DICIONÁRIO também sai em NFC ===');
// O dicionário é escrito à MÃO: nada garante que quem digitou a linha usou NFC. Como é o
// único caminho que devolve o acento perdido, ele é o mais provável de gravar NFD sem
// ninguém perceber. O teste injeta uma entrada em NFD e devolve o dicionário ao estado
// original no finally (na Fase 0 ele está vazio de propósito).
{
    const chave = chaveCidade('ITAPOA');
    const jaExistia = Object.prototype.hasOwnProperty.call(CIDADES_CANONICAS, chave);
    try {
        if (!jaExistia) CIDADES_CANONICAS[chave] = 'Itapoa\u0301';   // valor do dicionário em NFD
        conferir('dicionário em NFD → saída em NFC', normalizarCidade('ITAPOA'), 'Itapo\u00e1');
        conferir('  ... e casa com o nome digitado em NFC', normalizarCidade('ITAPOA') === 'Itapo\u00e1', true);
    } finally {
        if (!jaExistia) delete CIDADES_CANONICAS[chave];
    }
    conferir('  ... dicionário voltou ao estado original', Object.prototype.hasOwnProperty.call(CIDADES_CANONICAS, chave), jaExistia);
}

console.log('\n=== chaveCidade JÁ era imune ao NFC × NFD (por isso não leva normalize) ===');
// `chaveCidade` começa com `.normalize('NFD')`, que é canônico: as duas formas convergem
// para a MESMA string antes de qualquer outra coisa. Este teste trava essa propriedade —
// se alguém trocar o NFD por outra coisa, cai aqui.
conferir('chaveCidade(NFC) === chaveCidade(NFD)', chaveCidade(ITAPOA_NFC) === chaveCidade(ITAPOA_NFD), true);
conferir('chaveCidade(NFD)', chaveCidade(ITAPOA_NFD), 'itapoa');
conferir('chaveCidade de nome composto em NFD', chaveCidade('BALNEA\u0301RIO CAMBORIU\u0301'), 'balneario camboriu');
conferir('temAcento(NFD) enxerga o acento', temAcento(ITAPOA_NFD), true);

console.log('\n=== preposições em minúscula (mas nunca na 1ª palavra) ===');
conferir("normalizarCidade('JARAGUA DO SUL')", normalizarCidade('JARAGUA DO SUL'), 'Jaragua do Sul');
conferir("normalizarCidade('RIO DE JANEIRO')", normalizarCidade('RIO DE JANEIRO'), 'Rio de Janeiro');
conferir("normalizarCidade('EMBU DAS ARTES')", normalizarCidade('EMBU DAS ARTES'), 'Embu das Artes');
conferir("normalizarCidade('SANTANA DOS MONTES')", normalizarCidade('SANTANA DOS MONTES'), 'Santana dos Montes');
conferir("normalizarCidade('SAO JOSE E SILVA')", normalizarCidade('SAO JOSE E SILVA'), 'Sao Jose e Silva');
conferir("normalizarCidade('DO CARMO')       [preposição ABRINDO o nome]", normalizarCidade('DO CARMO'), 'Do Carmo');
conferir("normalizarCidade('DA PRAIA GRANDE')", normalizarCidade('DA PRAIA GRANDE'), 'Da Praia Grande');

console.log("\n=== apóstrofo (d') e hífen ===");
// ATENÇÃO: os dois casos abaixo são de SÃO PAULO, onde o IBGE grafa "d'" MINÚSCULO.
// Isso NÃO é regra geral do país — ver o bloco "D' maiúsculo (Rondônia)" mais abaixo.
conferir("normalizarCidade(\"SANTA BARBARA D'OESTE\") [SP: d' minúsculo]", normalizarCidade("SANTA BARBARA D'OESTE"), "Santa Barbara d'Oeste");
conferir("normalizarCidade(\"Santa Bárbara d'Oeste\")  [SP: já correta]", normalizarCidade("Santa Bárbara d'Oeste"), "Santa Bárbara d'Oeste");
conferir("normalizarCidade(\"OLHO D'AGUA\")", normalizarCidade("OLHO D'AGUA"), "Olho d'Agua");
conferir("normalizarCidade(\"olho d’agua\")   [apóstrofo curvo ’]", normalizarCidade('olho d’agua'), 'Olho d’Agua');
conferir("normalizarCidade(\"SANT'ANA\")      [não é partícula]", normalizarCidade("SANT'ANA"), "Sant'Ana");
conferir("normalizarCidade(\"D'AVILA\")       [partícula ABRINDO o nome]", normalizarCidade("D'AVILA"), "D'Avila");
conferir("normalizarCidade('MOGI-GUACU')     [hífen]", normalizarCidade('MOGI-GUACU'), 'Mogi-Guacu');
conferir("normalizarCidade('Mogi-Guaçu')     [hífen + cedilha]", normalizarCidade('Mogi-Guaçu'), 'Mogi-Guaçu');
conferir("normalizarCidade('XANGRI-LA')", normalizarCidade('XANGRI-LA'), 'Xangri-La');

console.log("\n=== D' MAIÚSCULO (Rondônia) — só o DICIONÁRIO resolve ===");
// O IBGE não é uniforme: SP grafa "Santa Bárbara d'Oeste" (minúsculo) e RO grafa
// "Alta Floresta D'Oeste" (MAIÚSCULO). Mesma palavra, mesmo formato, duas grafias
// oficiais — não há como o Title Case decidir olhando só a string.
//
// Os casos abaixo fixam o comportamento REAL de hoje, que para RO está ERRADO de
// propósito: `normalizarCidade` rebaixa o D. NÃO é para "consertar" a regra (ela
// quebraria SP). A correção é entrar em CIDADES_CANONICAS — as 6 linhas já estão
// prontas e COMENTADAS em utils/cidade.js. Enquanto estiverem comentadas, estes
// testes passam com a grafia errada; ao descomentar, os `esperado` viram o D maiúsculo.
const MUNICIPIOS_RO = [
    ["Alta Floresta D'Oeste",    "alta floresta d'oeste"],
    ["Espigão D'Oeste",          "espigao d'oeste"],
    ["Machadinho D'Oeste",       "machadinho d'oeste"],
    ["Nova Brasilândia D'Oeste", "nova brasilandia d'oeste"],
    ["Santa Luzia D'Oeste",      "santa luzia d'oeste"],
    ["São Felipe D'Oeste",       "sao felipe d'oeste"],
];
for (const [oficial, chaveEsperada] of MUNICIPIOS_RO) {
    // A chave tem que bater com a que está comentada no dicionário — senão, no dia em
    // que alguém descomentar, a linha simplesmente não pega e ninguém percebe.
    conferir(`chaveCidade(${JSON.stringify(oficial)})`, chaveCidade(oficial), chaveEsperada);
    const noDicionario = Object.prototype.hasOwnProperty.call(CIDADES_CANONICAS, chaveEsperada);
    const obtido = normalizarCidade(oficial);
    if (noDicionario) {
        conferir(`normalizarCidade(${JSON.stringify(oficial)}) [dicionário ATIVO]`, obtido, oficial);
    } else {
        // Sem dicionário o D vira minúsculo — é o defeito conhecido, documentado, não uma surpresa.
        conferir(`normalizarCidade(${JSON.stringify(oficial)}) [SEM dicionário → D rebaixado]`,
            obtido, oficial.replace("D'", "d'"));
    }
}
// Trava da Fase 0: o dicionário nasce VAZIO e só é preenchido com aprovação do dono.
// Se este caso falhar, é porque alguém ativou entrada no dicionário — aí a Fase 1
// passa a reescrever dado de produção, e isso tem que ser uma decisão consciente.
conferir('CIDADES_CANONICAS ainda está vazio (Fase 0 não aprova nada sozinha)',
    Object.keys(CIDADES_CANONICAS).length, 0);

console.log('\n=== ponto e pontuação ===');
conferir("normalizarCidade('S. BENTO DO SUL')", normalizarCidade('S. BENTO DO SUL'), 'S. Bento do Sul');
conferir("normalizarCidade('joinville.')", normalizarCidade('joinville.'), 'Joinville.');
conferir("normalizarCidade('(joinville)')", normalizarCidade('(joinville)'), '(Joinville)');

console.log('\n=== vazio / nulo / lixo ===');
conferir("normalizarCidade('')              [vazio]", normalizarCidade(''), null);
conferir("normalizarCidade('   ')           [só espaços]", normalizarCidade('   '), null);
conferir("normalizarCidade('\\t\\n ')         [só espaço em branco]", normalizarCidade('\t\n '), null);
conferir("normalizarCidade(null)", normalizarCidade(null), null);
conferir("normalizarCidade(undefined)", normalizarCidade(undefined), null);
conferir("normalizarCidade(123)             [número]", normalizarCidade(123), '123');
conferir("normalizarCidade(0)               [zero NÃO é vazio]", normalizarCidade(0), '0');
conferir("normalizarCidade('constructor')   [chave do Object.prototype]", normalizarCidade('constructor'), 'Constructor');
conferir("normalizarCidade('toString')      [idem]", normalizarCidade('toString'), 'Tostring'); // Title Case zera a caixa do meio — o que importa é NÃO devolver a função do prototype

console.log('\n=== idempotência (rodar de novo não muda nada) ===');
for (const v of ['JOINVILLE', 'jaragua do sul', "SANTA BARBARA D'OESTE", 'MOGI-GUACU', 'S. BENTO DO SUL', 'Itapoá']) {
    const uma = normalizarCidade(v);
    conferir(`normalizarCidade(normalizarCidade(${JSON.stringify(v)}))`, normalizarCidade(uma), uma);
}

console.log('\n=== temAcento (usado para escolher a melhor grafia do grupo) ===');
conferir("temAcento('Itapoá')", temAcento('Itapoá'), true);
conferir("temAcento('ITAPOA')", temAcento('ITAPOA'), false);
conferir("temAcento('Içara')  [cedilha conta]", temAcento('Içara'), true);
conferir("temAcento('Joinville')", temAcento('Joinville'), false);
conferir("temAcento(null)", temAcento(null), false);

console.log('\n=== o grupo casa mesmo com grafias diferentes (o que quebrava a comissão) ===');
const variantes = ['JOINVILLE', 'Joinville', 'joinville', '  Joinville ', 'JOINVILLE'];
const chaves = new Set(variantes.map(chaveCidade));
conferir('5 grafias de Joinville viram 1 chave só', chaves.size, 1);
const itapoa = new Set(['ITAPOA', 'Itapoá', 'itapoa', 'ITAPOÁ'].map(chaveCidade));
conferir('4 grafias de Itapoá viram 1 chave só', itapoa.size, 1);

console.log(`\n──────────────────────────────────────────────────────────────`);
console.log(`${falhas === 0 ? '✅' : '❌'}  ${ok} passaram, ${falhas} falharam.`);
process.exit(falhas === 0 ? 0 : 1);
