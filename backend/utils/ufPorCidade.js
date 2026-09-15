/**
 * UF POR NOME DE CIDADE — lista embutida, só para a SEMENTE do cadastro de cidades e
 * para SUGERIR a UF no modal "Cadastrar nova cidade".
 *
 * O que tem aqui: os 295 municípios de Santa Catarina (IBGE) + os municípios de outras
 * UFs que já apareceram no diagnóstico (`GET /api/admin-exec/diag-cidades`) e no banco
 * local em 09/2026 (fornecedores de SP/PR/RJ/MG/RS, leads de Guaratuba/Curitiba...).
 * NÃO é uma base do IBGE inteira, de propósito: a Hardt vende no litoral norte de SC e
 * no PR; uma lista nacional só serviria para o autocomplete oferecer cidade onde a
 * empresa não atende.
 *
 * Chave = `chaveCidade(nome)` (sem acento, minúscula) — a mesma da tabela `cidades`.
 *
 * `AMBIGUAS`: nomes que existem em MAIS DE UMA UF ("Bom Jesus" é SC, RS, PB, PI, RN...).
 * Para esses, `ufDe()` devolve `null` — a semente deixa a UF em branco e o dono completa
 * na tela Cidades. Chutar "SC" aqui gravaria UF errada em silêncio.
 */
const { chaveCidade } = require('./cidade');

const SC = [
    'Abdon Batista', 'Abelardo Luz', 'Agrolândia', 'Agronômica', 'Água Doce', 'Águas de Chapecó',
    'Águas Frias', 'Águas Mornas', 'Alfredo Wagner', 'Alto Bela Vista', 'Anchieta', 'Angelina',
    'Anita Garibaldi', 'Anitápolis', 'Antônio Carlos', 'Apiúna', 'Arabutã', 'Araquari', 'Araranguá',
    'Armazém', 'Arroio Trinta', 'Arvoredo', 'Ascurra', 'Atalanta', 'Aurora', 'Balneário Arroio do Silva',
    'Balneário Barra do Sul', 'Balneário Camboriú', 'Balneário Gaivota', 'Balneário Piçarras',
    'Balneário Rincão', 'Bandeirante', 'Barra Bonita', 'Barra Velha', 'Bela Vista do Toldo', 'Belmonte',
    'Benedito Novo', 'Biguaçu', 'Blumenau', 'Bocaina do Sul', 'Bom Jardim da Serra', 'Bom Jesus',
    'Bom Jesus do Oeste', 'Bom Retiro', 'Bombinhas', 'Botuverá', 'Braço do Norte', 'Braço do Trombudo',
    'Brunópolis', 'Brusque', 'Caçador', 'Caibi', 'Calmon', 'Camboriú', 'Campo Alegre', 'Campo Belo do Sul',
    'Campo Erê', 'Campos Novos', 'Canelinha', 'Canoinhas', 'Capão Alto', 'Capinzal', 'Capivari de Baixo',
    'Catanduvas', 'Caxambu do Sul', 'Celso Ramos', 'Cerro Negro', 'Chapadão do Lageado', 'Chapecó',
    'Cocal do Sul', 'Concórdia', 'Cordilheira Alta', 'Coronel Freitas', 'Coronel Martins', 'Correia Pinto',
    'Corupá', 'Criciúma', 'Cunha Porã', 'Cunhataí', 'Curitibanos', 'Descanso', 'Dionísio Cerqueira',
    'Dona Emma', 'Doutor Pedrinho', 'Entre Rios', 'Ermo', 'Erval Velho', 'Faxinal dos Guedes',
    'Flor do Sertão', 'Florianópolis', 'Formosa do Sul', 'Forquilhinha', 'Fraiburgo', 'Frei Rogério',
    'Galvão', 'Garopaba', 'Garuva', 'Gaspar', 'Governador Celso Ramos', 'Grão-Pará', 'Gravatal',
    'Guabiruba', 'Guaraciaba', 'Guaramirim', 'Guarujá do Sul', 'Guatambú', "Herval d'Oeste", 'Ibiam',
    'Ibicaré', 'Ibirama', 'Içara', 'Ilhota', 'Imaruí', 'Imbituba', 'Imbuia', 'Indaial', 'Iomerê', 'Ipira',
    'Iporã do Oeste', 'Ipuaçu', 'Ipumirim', 'Iraceminha', 'Irani', 'Irati', 'Irineópolis', 'Itá',
    'Itaiópolis', 'Itajaí', 'Itapema', 'Itapiranga', 'Itapoá', 'Ituporanga', 'Jaborá', 'Jacinto Machado',
    'Jaguaruna', 'Jaraguá do Sul', 'Jardinópolis', 'Joaçaba', 'Joinville', 'José Boiteux', 'Jupiá',
    'Lacerdópolis', 'Lages', 'Laguna', 'Lajeado Grande', 'Laurentino', 'Lauro Müller', 'Lebon Régis',
    'Leoberto Leal', 'Lindóia do Sul', 'Lontras', 'Luiz Alves', 'Luzerna', 'Macieira', 'Mafra',
    'Major Gercino', 'Major Vieira', 'Maracajá', 'Maravilha', 'Marema', 'Massaranduba', 'Matos Costa',
    'Meleiro', 'Mirim Doce', 'Modelo', 'Mondaí', 'Monte Carlo', 'Monte Castelo', 'Morro da Fumaça',
    'Morro Grande', 'Navegantes', 'Nova Erechim', 'Nova Itaberaba', 'Nova Trento', 'Nova Veneza',
    'Novo Horizonte', 'Orleans', 'Otacílio Costa', 'Ouro', 'Ouro Verde', 'Paial', 'Painel', 'Palhoça',
    'Palma Sola', 'Palmeira', 'Palmitos', 'Papanduva', 'Paraíso', 'Passo de Torres', 'Passos Maia',
    'Paulo Lopes', 'Pedras Grandes', 'Penha', 'Peritiba', 'Pescaria Brava', 'Petrolândia', 'Pinhalzinho',
    'Pinheiro Preto', 'Piratuba', 'Planalto Alegre', 'Pomerode', 'Ponte Alta', 'Ponte Alta do Norte',
    'Ponte Serrada', 'Porto Belo', 'Porto União', 'Pouso Redondo', 'Praia Grande',
    'Presidente Castello Branco', 'Presidente Getúlio', 'Presidente Nereu', 'Princesa', 'Quilombo',
    'Rancho Queimado', 'Rio das Antas', 'Rio do Campo', 'Rio do Oeste', 'Rio do Sul', 'Rio dos Cedros',
    'Rio Fortuna', 'Rio Negrinho', 'Rio Rufino', 'Riqueza', 'Rodeio', 'Romelândia', 'Salete', 'Saltinho',
    'Salto Veloso', 'Sangão', 'Santa Cecília', 'Santa Helena', 'Santa Rosa de Lima', 'Santa Rosa do Sul',
    'Santa Terezinha', 'Santa Terezinha do Progresso', 'Santiago do Sul', 'Santo Amaro da Imperatriz',
    'São Bento do Sul', 'São Bernardino', 'São Bonifácio', 'São Carlos', 'São Cristóvão do Sul',
    'São Domingos', 'São Francisco do Sul', 'São João Batista', 'São João do Itaperiú', 'São João do Oeste',
    'São João do Sul', 'São Joaquim', 'São José', 'São José do Cedro', 'São José do Cerrito',
    'São Lourenço do Oeste', 'São Ludgero', 'São Martinho', 'São Miguel da Boa Vista', 'São Miguel do Oeste',
    'São Pedro de Alcântara', 'Saudades', 'Schroeder', 'Seara', 'Serra Alta', 'Siderópolis', 'Sombrio',
    'Sul Brasil', 'Taió', 'Tangará', 'Tigrinhos', 'Tijucas', 'Timbé do Sul', 'Timbó', 'Timbó Grande',
    'Três Barras', 'Treviso', 'Treze de Maio', 'Treze Tílias', 'Trombudo Central', 'Tubarão', 'Tunápolis',
    'Turvo', 'União do Oeste', 'Urubici', 'Urupema', 'Urussanga', 'Vargeão', 'Vargem', 'Vargem Bonita',
    'Vidal Ramos', 'Videira', 'Vitor Meireles', 'Witmarsum', 'Xanxerê', 'Xavantina', 'Xaxim', 'Zortéa',
];

/** Municípios de OUTRAS UFs que já apareceram na base (fornecedores, leads de fora). */
const OUTRAS = {
    PR: ['Abatiá', 'Campo Largo', 'Curitiba', 'Guaratuba', 'Maringá', 'Piraquara', 'São José dos Pinhais',
        'Sertanópolis', 'Paranaguá', 'Londrina', 'Ponta Grossa', 'Pinhais', 'Colombo', 'Araucária',
        'Matinhos', 'Pontal do Paraná', 'Morretes', 'Antonina'],
    SP: ['Barueri', 'Bragança Paulista', 'Cubatão', 'Guará', "Santa Bárbara d'Oeste", 'Santo André',
        'São Paulo', 'Campinas', 'Guarulhos', 'Osasco', 'Sorocaba', 'Jundiaí'],
    RJ: ['Rio de Janeiro', 'Saquarema', 'Volta Redonda'],
    MG: ['Extrema', 'Juiz de Fora', 'Matias Barbosa', 'Belo Horizonte'],
    RS: ['Porto Alegre', 'Caxias do Sul', 'Gramado', 'Canela', 'Torres', 'Novo Hamburgo'],
    BA: ['Salvador'],
};

/**
 * Nomes que existem em MAIS DE UMA UF (IBGE). Para esses `ufDe()` devolve null.
 * "Lajeado" está aqui porque existe em RS e em TO; "Cafelândia" em PR e SP.
 */
const AMBIGUAS = new Set([
    'Anchieta', 'Antônio Carlos', 'Aurora', 'Barra Bonita', 'Belmonte', 'Bom Jesus', 'Campo Alegre',
    'Catanduvas', 'Entre Rios', 'Guaraciaba', 'Irati', 'Jardinópolis', 'Monte Castelo', 'Nova Veneza',
    'Novo Horizonte', 'Ouro Verde', 'Palmeira', 'Paraíso', 'Petrolândia', 'Pinhalzinho', 'Ponte Alta',
    'Praia Grande', 'Saltinho', 'Santa Cecília', 'Santa Helena', 'Santa Rosa de Lima', 'Santa Terezinha',
    'São Carlos', 'São Domingos', 'São João Batista', 'São Martinho', 'Tangará', 'Turvo', 'Vargem',
    'Vargem Bonita', 'Bom Retiro', 'Lajeado', 'Cafelândia',
].map(chaveCidade));

/** chave -> UF, só para os nomes NÃO ambíguos. */
const UF_POR_CHAVE = new Map();
for (const nome of SC) {
    const chave = chaveCidade(nome);
    if (!AMBIGUAS.has(chave)) UF_POR_CHAVE.set(chave, 'SC');
}
for (const [uf, nomes] of Object.entries(OUTRAS)) {
    for (const nome of nomes) {
        const chave = chaveCidade(nome);
        if (!AMBIGUAS.has(chave) && !UF_POR_CHAVE.has(chave)) UF_POR_CHAVE.set(chave, uf);
    }
}

/** UF do município pelo nome (ou chave). `null` = desconhecido OU ambíguo. */
function ufDe(nomeOuChave) {
    const chave = chaveCidade(nomeOuChave);
    if (!chave || AMBIGUAS.has(chave)) return null;
    return UF_POR_CHAVE.get(chave) || null;
}

/** O nome existe em mais de uma UF? (aí a semente deixa a UF em branco para o dono escolher) */
function ehAmbiguo(nomeOuChave) {
    return AMBIGUAS.has(chaveCidade(nomeOuChave));
}

/** As 27 UFs — validação do POST /api/cidades. */
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR',
    'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

/**
 * ufDeTexto — DIFERENTE de `ufDe()` acima (aquele resolve UF a partir de NOME DE
 * CIDADE, para a semente/sugestão). Este resolve UF a partir de um texto que já
 * deveria SER a UF: sigla pronta ("SC") ou nome de ESTADO por extenso ("Santa
 * Catarina"/"SANTA CATARINA"). Motivo: o worker do CA grava `Fornecedor.uf` por
 * extenso (contasPagarCaSyncService.js), e `contaAzulService.js`/`fornecedores.js`
 * antes faziam `.slice(0,2)` num texto assim — "Santa Catarina".slice(0,2) = "SA",
 * uma UF FALSA que parece válida e quebra a validação de IE em silêncio. Sem
 * correspondência (nome ambíguo, lixo, etc.) devolve `null` em vez de chutar.
 */
const NOME_ESTADO_PARA_SIGLA = {
    'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM', 'bahia': 'BA',
    'ceara': 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES', 'goias': 'GO',
    'maranhao': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG',
    'para': 'PA', 'paraiba': 'PB', 'parana': 'PR', 'pernambuco': 'PE', 'piaui': 'PI',
    'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS',
    'rondonia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP',
    'sergipe': 'SE', 'tocantins': 'TO',
};
const UFS_VALIDAS = new Set(UFS);

function semAcentoMinusculo(v) {
    return String(v == null ? '' : v)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

/**
 * @param {string} txt - sigla ("SC") ou nome de estado por extenso ("Santa Catarina").
 * @returns {string|null} sigla de 2 letras válida, ou null se não reconhecida.
 */
function ufDeTexto(txt) {
    if (!txt) return null;
    const bruto = String(txt).trim().toUpperCase();
    if (UFS_VALIDAS.has(bruto)) return bruto;
    return NOME_ESTADO_PARA_SIGLA[semAcentoMinusculo(txt)] || null;
}

module.exports = { ufDe, ehAmbiguo, UFS, MUNICIPIOS_SC: SC, TOTAL_SC: SC.length, ufDeTexto };
