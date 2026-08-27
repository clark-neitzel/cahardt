/**
 * TESTE do utilitário `utils/cidade.js` (padronização de grafia de cidade — Fase 0).
 *
 * NÃO toca no banco, não lê env, não escreve nada — é só função pura.
 * Uso:  node scripts/teste-cidade.js
 * Sai com código 1 se algum caso falhar (dá para plugar em CI depois).
 */
const { chaveCidade, normalizarCidade, temAcento, CIDADES_CANONICAS } = require('../utils/cidade');
const { unirDiasSemana, deduplicarMetasCidades } = require('../utils/metaCidadeMerge');

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
conferir("normalizarCidade('ITAPOA')        [dicionário devolve o acento]", normalizarCidade('ITAPOA'), 'Itapoá');
// Antes da Fase 1 esta linha esperava "Itapoa", SEM acento — Title Case não inventa acento.
// É exatamente por isso que o dicionário existe, e é a linha que prova que ele está ligado.
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
    // Cidade INVENTADA de propósito: a partir da Fase 1 o dicionário está preenchido, e usar
    // uma chave real ('itapoa') faria o teste passar por acidente — a entrada de verdade já
    // está em NFC. Com uma chave que não existe, o teste continua provando o que interessa:
    // um valor escrito à mão em NFD sai NFC do outro lado.
    const chave = chaveCidade('CIDADE DE TESTE NFD');
    const jaExistia = Object.prototype.hasOwnProperty.call(CIDADES_CANONICAS, chave);
    conferir('a chave de teste não existe no dicionário real', jaExistia, false);
    try {
        CIDADES_CANONICAS[chave] = 'Cidade de Teste Nfda\u0301';   // valor do dicionário em NFD
        conferir('dicionário em NFD → saída em NFC', normalizarCidade('CIDADE DE TESTE NFD'), 'Cidade de Teste Nfd\u00e1');
        conferir('  ... e casa com o nome digitado em NFC',
            normalizarCidade('CIDADE DE TESTE NFD') === 'Cidade de Teste Nfd\u00e1', true);
    } finally {
        delete CIDADES_CANONICAS[chave];
    }
    conferir('  ... dicionário voltou ao estado original', Object.prototype.hasOwnProperty.call(CIDADES_CANONICAS, chave), false);

    // E o caminho do dicionário REAL também sai em NFC (as 19 linhas foram digitadas à mão).
    let foraDeNFC = 0;
    for (const nome of Object.values(CIDADES_CANONICAS)) if (nome !== nome.normalize('NFC')) foraDeNFC++;
    conferir('nenhuma linha do dicionário real está fora de NFC', foraDeNFC, 0);
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
conferir("normalizarCidade('JARAGUA DO SUL')  [dicionário: com acento]", normalizarCidade('JARAGUA DO SUL'), 'Jaraguá do Sul');
conferir("normalizarCidade('MOGI DAS CRUZES')  [sem dicionário: Title Case]", normalizarCidade('MOGI DAS CRUZES'), 'Mogi das Cruzes');
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
// Trava da FASE 1: o dicionário deixou de estar vazio, e cada linha REESCREVE dado real.
// O teste fixa a lista exata que o dono aprovou em 08/2026. Se este caso falhar é porque
// alguém acrescentou/removeu linha — o que tem que ser uma decisão consciente, com
// aprovação, e não um efeito colateral de refatoração.
const DICIONARIO_APROVADO = {
    // grafias divergentes (nome oficial acentuado)
    'joinville': 'Joinville',
    'jaragua do sul': 'Jaraguá do Sul',
    'itajai': 'Itajaí',
    'itapoa': 'Itapoá',
    'camboriu': 'Camboriú',
    'araquari': 'Araquari',
    'guaramirim': 'Guaramirim',
    'barra velha': 'Barra Velha',
    'balneario picarras': 'Balneário Piçarras',
    'luiz alves': 'Luiz Alves',
    'salvador': 'Salvador',
    'sao francisco do sul': 'São Francisco do Sul',
    // erros de digitação aprovados um a um (10 leads)
    'joiville': 'Joinville',
    'joinvile': 'Joinville',
    'joinvlle': 'Joinville',
    'noinville': 'Joinville',
    'joinvillevile': 'Joinville',
    'joinyille': 'Joinville',
    // nome incompleto no cadastro
    'sao francisco': 'São Francisco do Sul',
    // sentinela: NÃO é cidade, mapeada para ela mesma para o backfill não tocar
    'sem cidade': 'Sem cidade',
};
conferir('o dicionário tem exatamente as linhas aprovadas',
    JSON.stringify(CIDADES_CANONICAS), JSON.stringify(DICIONARIO_APROVADO));
conferir('  ... 20 linhas', Object.keys(CIDADES_CANONICAS).length, 20);
// 'joinyille' (1 lead, "Joinyille") é distância 1 de Joinville. Ficou FORA da primeira lista
// porque o dono não o tinha aprovado — código não decide erro de digitação sozinho. Ele
// aprovou na conferência da Fase 1, então agora a trava é ao contrário: a linha TEM que estar
// no dicionário, e "Joinyille" TEM que virar "Joinville" (10 leads no total).
conferir("'joinyille' está no dicionário (aprovado pelo dono na conferência da Fase 1)",
    Object.prototype.hasOwnProperty.call(CIDADES_CANONICAS, 'joinyille'), true);
conferir("  ... e por isso 'Joinyille' vira 'Joinville'", normalizarCidade('Joinyille'), 'Joinville');

console.log('\n=== FASE 1: as grafias reais do banco caem no nome oficial ===');
// Cada linha abaixo é uma grafia que EXISTE hoje em produção (saída do diag-cidades).
for (const [bruto, esperado] of [
    ['Joinville ',            'Joinville'],
    ['JOINVILLE',             'Joinville'],
    ['joinville',             'Joinville'],
    ['Jaraguá do sul ',       'Jaraguá do Sul'],
    ['Jaraguá do sul',        'Jaraguá do Sul'],
    ['JARAGUA DO SUL',        'Jaraguá do Sul'],
    ['Itajai',                'Itajaí'],
    ['ITAJAI',                'Itajaí'],
    ['Itajaí ',               'Itajaí'],
    ['ITAPOA',                'Itapoá'],
    ['Itapoa',                'Itapoá'],
    ['Camboriú ',             'Camboriú'],
    ['CAMBORIU',              'Camboriú'],
    ['Araquari ',             'Araquari'],
    ['Guaramirim ',           'Guaramirim'],
    ['Barra velha ',          'Barra Velha'],
    ['Balneário piçarras ',   'Balneário Piçarras'],
    ['LUIZ ALVES',            'Luiz Alves'],
    ['SALVADOR',              'Salvador'],
]) {
    conferir(`normalizarCidade(${JSON.stringify(bruto)})`, normalizarCidade(bruto), esperado);
}

console.log('\n=== FASE 1: APELIDOS — o dicionário FUNDE chaves diferentes ===');
// Este é o detalhe que mais confunde: `chaveCidade('Joiville')` é 'joiville', uma chave
// DISTINTA de 'joinville'. Só o dicionário junta as duas. Quem agrupa por chave (o
// diag-cidades) vê dois grupos com o MESMO nome final — por isso a rota passou a
// reportar `fundeCom`/`fusoesPorNomeFinal`.
conferir("chaveCidade('Joiville') NÃO é a chave de Joinville",
    chaveCidade('Joiville') === chaveCidade('Joinville'), false);
for (const [bruto, esperado] of [
    ['Joiville',      'Joinville'],
    ['Joinvile',      'Joinville'],
    ['Joinvlle',      'Joinville'],
    ['Noinville',     'Joinville'],
    ['Joinvillevile', 'Joinville'],
    ['JOIVILLE',      'Joinville'],   // o apelido também vale em caixa alta
    ['  joiville  ',  'Joinville'],   // ... e com espaço sobrando
]) {
    conferir(`apelido ${JSON.stringify(bruto)}`, normalizarCidade(bruto), esperado);
}
conferir("chaveCidade('São Francisco') NÃO é a chave de São Francisco do Sul",
    chaveCidade('São Francisco') === chaveCidade('São Francisco do Sul'), false);
conferir("normalizarCidade('São Francisco ')  [nome incompleto no cadastro]",
    normalizarCidade('São Francisco '), 'São Francisco do Sul');
conferir("normalizarCidade('SAO FRANCISCO')", normalizarCidade('SAO FRANCISCO'), 'São Francisco do Sul');
conferir("normalizarCidade('São Francisco do Sul') [já correta, não muda]",
    normalizarCidade('São Francisco do Sul'), 'São Francisco do Sul');

console.log('\n=== FASE 1: "Sem cidade" NÃO PODE VIRAR CIDADE ===');
// 2 linhas de meta_cidades têm o texto literal "Sem cidade" (o rótulo do vazio, salvo
// como se fosse cidade). O dono mandou NÃO MEXER. Sem a linha do dicionário, o Title Case
// devolveria "Sem Cidade" e o backfill da Fase 2 reescreveria as duas, criando a cidade
// fantasma "Sem Cidade" nos dropdowns.
conferir("normalizarCidade('Sem cidade') NÃO vira 'Sem Cidade'", normalizarCidade('Sem cidade'), 'Sem cidade');
conferir('  ... ou seja, o backfill vê "não mudou"', normalizarCidade('Sem cidade') === 'Sem cidade', true);
conferir("normalizarCidade('SEM CIDADE') também cai no literal", normalizarCidade('SEM CIDADE'), 'Sem cidade');
// E o VAZIO de verdade continua virando null, nunca um nome (a trava original da Fase 0).
conferir("normalizarCidade('') continua null (vazio nunca vira cidade)", normalizarCidade(''), null);

console.log('\n=== FASE 1: toda linha do dicionário é IDEMPOTENTE ===');
// Se `normalizarCidade(valor) !== valor` para alguma entrada, o backfill da Fase 2 acharia
// que o dado ainda está errado TODA VEZ que rodasse — reescrevendo em laço, para sempre.
{
    let quebradas = 0;
    for (const [chave, nome] of Object.entries(CIDADES_CANONICAS)) {
        if (normalizarCidade(nome) !== nome) { quebradas++; console.log(`      ^ ${chave} -> ${nome} -> ${normalizarCidade(nome)}`); }
    }
    conferir('nenhuma entrada muda ao ser normalizada de novo', quebradas, 0);
    // A chave também tem que ser mesmo o resultado de chaveCidade — chave digitada errada
    // (com acento, ou com maiúscula) simplesmente NUNCA pega, e ninguém percebe.
    let chavesRuins = 0;
    for (const chave of Object.keys(CIDADES_CANONICAS)) if (chaveCidade(chave) !== chave) { chavesRuins++; console.log(`      ^ chave inválida: ${JSON.stringify(chave)}`); }
    conferir('toda chave é o resultado de chaveCidade(...)', chavesRuins, 0);
}

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
for (const v of ['JOINVILLE', 'jaragua do sul', "SANTA BARBARA D'OESTE", 'MOGI-GUACU', 'S. BENTO DO SUL', 'Itapoá',
    // apelidos: normalizar duas vezes tem que dar o MESMO nome. Se 'joiville' -> 'Joinville'
    // e 'Joinville' voltasse a mudar, o backfill entraria em laço.
    'Joiville', 'Noinville', 'São Francisco ', 'Sem cidade', 'ITAPOA']) {
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


console.log('\n=== unirDiasSemana — a UNIÃO dos dias na fusão de metas ===');
conferir("'SEG,QUI' + 'QUI,SEX'", unirDiasSemana(['SEG,QUI', 'QUI,SEX']), 'SEG,QUI,SEX');
conferir('ordem da SEMANA, não alfabética', unirDiasSemana(['SEX,SEG,QUA']), 'SEG,QUA,SEX');
conferir('espaço e caixa não contam', unirDiasSemana([' seg , QUI ', 'qui']), 'SEG,QUI');
conferir('null / vazio → null', unirDiasSemana([null, '', undefined]), null);
conferir('sem argumento → null', unirDiasSemana(), null);
conferir('string solta também vale', unirDiasSemana('QUI,SEG'), 'SEG,QUI');
// "N/D" EXISTE no banco (2 linhas reais de meta_cidades). Não pode ser jogado fora — seria
// perder dado — nem ordenado junto com a semana — embaralharia os dias.
conferir("desconhecido ('N/D') vai para o FIM", unirDiasSemana(['N/D,SEG,TER,QUA,QUI,SEX', 'N/D']), 'SEG,TER,QUA,QUI,SEX,N/D');
conferir('  ... e não some quando é o único', unirDiasSemana(['N/D']), 'N/D');
conferir('vários desconhecidos saem em ordem alfabética', unirDiasSemana(['ZZZ,N/D,SEG']), 'SEG,N/D,ZZZ');
// Reproduz EXATAMENTE a proposta que o diagnóstico mostrou ao dono para a meta da Letícia.
conferir('reproduz a proposta real (Letícia Piske · Joinville)',
    unirDiasSemana(['N/D,SEG,TER,QUA,QUI,SEX', 'N/D']), 'SEG,TER,QUA,QUI,SEX,N/D');

console.log('\n=== deduplicarMetasCidades — a REGRESSÃO que a Fase 1 criaria sem ele ===');
// meta_cidades tem @@unique([metaMensalVendedorId, cidade]). Antes, "JOINVILLE" e "Joinville"
// eram strings diferentes e o índice deixava passar as duas. Depois de normalizar as duas
// viram "Joinville" — sem dedupe, o createMany viola o índice e A META NÃO SALVA (erro 500).
{
    const r = deduplicarMetasCidades([
        { cidade: 'Joinville', valor: 107132.05, diasSemana: 'N/D,SEG,TER,QUA,QUI,SEX' },
        { cidade: 'JOINVILLE', valor: 231, diasSemana: 'N/D' },
    ]);
    conferir('2 grafias de Joinville → 1 linha', r.cidades.length, 1);
    conferir('  ... cidade normalizada', r.cidades[0].cidade, 'Joinville');
    // SOMAR, nunca escolher a maior: a meta da cidade é uma só, e escolher APAGARIA meta
    // de verdade e mudaria o bônus do vendedor. Este é o número que o dono aprovou.
    conferir('  ... valor SOMADO (107132,05 + 231,00)', r.cidades[0].valor, 107363.05);
    conferir('  ... dias UNIDOS, desconhecido no fim', r.cidades[0].diasSemana, 'SEG,TER,QUA,QUI,SEX,N/D');
}
{
    // O caso real do Jociel com Itapoá — grafia sem acento + grafia com acento.
    const r = deduplicarMetasCidades([
        { cidade: 'ITAPOA', valor: 243.22, diasSemana: 'SEG' },
        { cidade: 'Itapoá', valor: 6403.04, diasSemana: 'SEG' },
    ]);
    conferir('ITAPOA + Itapoá → 1 linha', r.cidades.length, 1);
    conferir('  ... cidade', r.cidades[0].cidade, 'Itapoá');
    conferir('  ... valor (float não pode virar 6646.259999999999)', r.cidades[0].valor, 6646.26);
    conferir('  ... dias', r.cidades[0].diasSemana, 'SEG');
}
{
    // APELIDO: 'joiville' é chave DIFERENTE de 'joinville'. Se o dedupe agrupasse pela chave
    // da cidade CRUA, as duas passariam e o @@unique estouraria exatamente como antes — por
    // isso ele agrupa pela chave do NOME FINAL.
    const r = deduplicarMetasCidades([
        { cidade: 'Joinville', valor: 100, diasSemana: 'SEG' },
        { cidade: 'Joiville', valor: 50, diasSemana: 'TER' },
    ]);
    conferir('apelido + oficial → 1 linha só', r.cidades.length, 1);
    conferir('  ... valor somado', r.cidades[0].valor, 150);
    conferir('  ... dias unidos', r.cidades[0].diasSemana, 'SEG,TER');
}
{
    const r = deduplicarMetasCidades([
        { cidade: 'Itapoá', valor: 10, diasSemana: 'SEG' },
        { cidade: 'Garuva', valor: 20, diasSemana: 'TER' },
        { cidade: 'Araquari', valor: 30 },
    ]);
    conferir('cidades diferentes NÃO são fundidas', r.cidades.length, 3);
    conferir('  ... ordem de entrada preservada', r.cidades.map(c => c.cidade).join(','), 'Itapoá,Garuva,Araquari');
    conferir('  ... sem dias → null (não string vazia)', r.cidades[2].diasSemana, null);
}
{
    // Linha sem cidade não tem como ser gravada (meta_cidades.cidade é NOT NULL) nem casada
    // com pedido nenhum. É descartada, mas o chamador fica sabendo — nunca some em silêncio.
    const r = deduplicarMetasCidades([
        { cidade: '   ', valor: 10 },
        { cidade: null, valor: 20 },
        { cidade: 'Itapoá', valor: 30 },
    ]);
    conferir('linhas sem cidade são descartadas', r.cidades.length, 1);
    conferir('  ... e contadas para o log', r.descartadasSemCidade, 2);
}
conferir('lista vazia → nada', deduplicarMetasCidades([]).cidades.length, 0);
conferir('null → nada (não explode)', deduplicarMetasCidades(null).cidades.length, 0);
conferir('undefined → nada', deduplicarMetasCidades(undefined).cidades.length, 0);
conferir('valor ausente vira 0', deduplicarMetasCidades([{ cidade: 'Itapoá' }]).cidades[0].valor, 0);
conferir('valor em string ("10.5") é somado como número',
    deduplicarMetasCidades([{ cidade: 'Itapoá', valor: '10.5' }, { cidade: 'ITAPOA', valor: '4.5' }]).cidades[0].valor, 15);
{
    // O nome vem do formulário — "constructor"/"__proto__" são só mais um nome. Se o dedupe
    // usasse objeto no lugar de Map, cairia em método do Object.prototype.
    const r = deduplicarMetasCidades([{ cidade: 'constructor', valor: 1 }, { cidade: 'CONSTRUCTOR', valor: 2 }]);
    conferir("cidade 'constructor' vira 1 linha", r.cidades.length, 1);
    conferir('  ... e o valor é número', r.cidades[0].valor, 3);
    const r2 = deduplicarMetasCidades([{ cidade: '__proto__', valor: 1 }, { cidade: '__PROTO__', valor: 2 }]);
    conferir("cidade '__proto__' vira 1 linha", r2.cidades.length, 1);
}
{
    // Idempotência: passar a saída do dedupe de novo tem que dar exatamente o mesmo —
    // é o que garante que salvar a meta duas vezes não muda nada.
    const uma = deduplicarMetasCidades([
        { cidade: 'JOINVILLE', valor: 231, diasSemana: 'N/D' },
        { cidade: 'Joinville', valor: 107132.05, diasSemana: 'SEG,TER' },
    ]).cidades;
    const duas = deduplicarMetasCidades(uma).cidades;
    conferir('dedupe(dedupe(x)) === dedupe(x)', JSON.stringify(duas), JSON.stringify(uma));
}

console.log(`\n──────────────────────────────────────────────────────────────`);
console.log(`${falhas === 0 ? '✅' : '❌'}  ${ok} passaram, ${falhas} falharam.`);
process.exit(falhas === 0 ? 0 : 1);
