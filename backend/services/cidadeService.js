/**
 * CADASTRO OFICIAL DE CIDADES — o coração da regra "não quero cidade repetida".
 * Plano: docs/cidades/PLANO-CADASTRO.md (arquiteto, 14/09/2026).
 *
 * O QUE ISTO FAZ
 * --------------
 * Existe UMA lista oficial (`cidades`). Todo campo Cidade do app só aceita item dessa lista.
 * As 6 tabelas que guardam cidade continuam gravando TEXTO (sem FK — `clientes` está no teto
 * de colunas): o texto gravado passa a ser sempre `cidades.nome` da linha ativa.
 *
 * `resolver(nomeBruto, { modo })` é a única porta de entrada para os 11 pontos de escrita:
 *   · 'estrito'   (tela: cliente, lead, fornecedor, bairro, meta) — cidade desconhecida
 *                 vira erro 400 `CIDADE_NAO_CADASTRADA` com sugestões ("você quis dizer").
 *   · 'tolerante' (sync do Conta Azul, IA externa) — NUNCA quebra: grava o nome normalizado
 *                 e registra uma PENDÊNCIA para o admin resolver na tela Cidades.
 *
 * CACHE: `Map<chave, Cidade>` com TTL de 60 s, invalidado por toda escrita deste service.
 * Com 2 réplicas o TTL cobre (cidade criada numa aparece na outra em até 1 min). Só o
 * `resolver` usa o cache; `listar` lê do banco.
 *
 * NUNCA gravar `chave` (sem acento) como nome; `nome` tem de ser `normalizarCidade(nome)`,
 * senão a Fase 1 (que normaliza toda entrada) re-sujaria o dado.
 */
const prisma = require('../config/database');
const { chaveCidade, normalizarCidade, CIDADES_CANONICAS } = require('../utils/cidade');
const { ufDe, UFS, ufDeTexto } = require('../utils/ufPorCidade');

const CACHE_TTL_MS = 60 * 1000;
const SENTINELA_SEM_CIDADE = 'sem cidade';
const ORIGENS_PENDENCIA = new Set(['CA_SYNC', 'IA_LEAD', 'CA_FORNECEDOR']);

let _cache = { carregadoEm: 0, porChave: new Map(), porId: new Map() };

function invalidarCache() {
    _cache = { carregadoEm: 0, porChave: new Map(), porId: new Map() };
}

async function carregarCache() {
    if (Date.now() - _cache.carregadoEm < CACHE_TTL_MS && _cache.porChave.size) return _cache;
    const linhas = await prisma.cidade.findMany();
    const porChave = new Map();
    const porId = new Map();
    for (const c of linhas) { porChave.set(c.chave, c); porId.set(c.id, c); }
    _cache = { carregadoEm: Date.now(), porChave, porId };
    return _cache;
}

/** Erro com status/código para a rota devolver `{ codigo, cidade, sugestoes }`. */
function erroCidade(status, codigo, mensagem, extra = {}) {
    return Object.assign(new Error(mensagem), { status, codigo, ...extra });
}

function validarUf(uf) {
    const u = String(uf == null ? '' : uf).trim().toUpperCase();
    if (!u) return null;
    if (!UFS.includes(u)) throw erroCidade(400, 'UF_INVALIDA', `UF inválida: "${uf}". Use a sigla (SC, PR, SP...).`);
    return u;
}

/**
 * Chave "alvo" de um texto: a própria chave, ou — se for um apelido do dicionário
 * ("joinvile" -> "Joinville") — a chave do nome oficial. É assim que "Joinvile" cai em Joinville
 * sem precisar de linha na tabela.
 */
function chaveAlvoDe(texto) {
    const chave = chaveCidade(texto);
    if (chave && Object.prototype.hasOwnProperty.call(CIDADES_CANONICAS, chave)) {
        return chaveCidade(CIDADES_CANONICAS[chave]);
    }
    return chave;
}

/** Segue `fundidaEmId` (no máximo 5 saltos — proteção contra ciclo) e devolve a cidade ativa final. */
function seguirFusao(cidade, cache) {
    let atual = cidade;
    for (let i = 0; i < 5 && atual && !atual.ativo && atual.fundidaEmId; i++) {
        atual = cache.porId.get(atual.fundidaEmId) || null;
    }
    return atual;
}

function publica(c) {
    if (!c) return null;
    return { id: c.id, nome: c.nome, uf: c.uf, ibge: c.ibge, ativo: c.ativo, fundidaEmId: c.fundidaEmId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sugestões ("você quis dizer")
// ─────────────────────────────────────────────────────────────────────────────
function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            const custo = a[i - 1] === b[j - 1] ? 0 : 1;
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + custo);
        }
        prev = cur;
    }
    return prev[b.length];
}

/**
 * Até `limite` cidades ATIVAS parecidas com o texto: Levenshtein <= 2 sobre a chave, ou
 * prefixo/contém (texto com 3+ letras). Ordena por distância, depois nome.
 * Devolve [{ id, nome, uf, distancia }].
 */
async function sugerir(nome, { limite = 5 } = {}) {
    const chave = chaveAlvoDe(nome);
    if (!chave) return [];
    const cache = await carregarCache();
    const achadas = [];
    for (const c of cache.porChave.values()) {
        if (!c.ativo) continue;
        const d = levenshtein(chave, c.chave);
        const parecida = d <= 2
            || (chave.length >= 3 && (c.chave.startsWith(chave) || c.chave.includes(chave)))
            || (c.chave.length >= 3 && chave.includes(c.chave));
        if (parecida) achadas.push({ id: c.id, nome: c.nome, uf: c.uf, distancia: d });
    }
    achadas.sort((a, b) => (a.distancia - b.distancia) || a.nome.localeCompare(b.nome, 'pt-BR'));
    return achadas.slice(0, limite);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pendências (entrada automática com cidade fora da lista)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Registra/incrementa a pendência daquela grafia. FORA de transação e em try/catch próprio:
 * nunca derruba o sync/IA que chamou. `exemplo` = "clientes:UUID" do primeiro registro.
 */
async function registrarPendencia({ chave, nomeBruto, nomeGravado, uf, origem, exemplo }) {
    try {
        const orig = ORIGENS_PENDENCIA.has(origem) ? origem : 'CA_SYNC';
        await prisma.cidadePendente.upsert({
            where: { chave },
            create: {
                chave, nomeBruto: String(nomeBruto).trim(), nomeGravado, uf: uf || null,
                origem: orig, ocorrencias: 1, exemplo: exemplo || null,
            },
            update: {
                ocorrencias: { increment: 1 },
                resolvidoEm: null, cidadeId: null,      // reapareceu depois de resolvida → volta a pendente
                ...(exemplo ? { exemplo } : {}),
            },
        });
    } catch (e) {
        console.error('[cidadeService] falha ao registrar pendência (origem já gravada):', e.message);
    }
}

/** Preenche `exemplo` de uma pendência que ainda não tem (o lead só ganha id depois de criado). */
async function anotarExemploPendencia(nome, exemplo) {
    try {
        const chave = chaveAlvoDe(nome);
        if (!chave || !exemplo) return;
        await prisma.cidadePendente.updateMany({ where: { chave, exemplo: null }, data: { exemplo } });
    } catch (e) {
        console.error('[cidadeService] falha ao anotar exemplo da pendência:', e.message);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// resolver — a porta única dos pontos de escrita
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {string|null} nomeBruto  o que veio (tela, Receita, CA, IA)
 * @param {object} op
 *   modo:    'estrito' (padrão) | 'tolerante'
 *   origem:  CA_SYNC | IA_LEAD | CA_FORNECEDOR (só tolerante; vai na pendência)
 *   exemplo: "clientes:UUID" (só tolerante)
 *   uf:      UF que veio junto (só para a pendência)
 * @returns {Promise<string|null>} o `nome` oficial da cidade ATIVA, ou null para vazio
 * @throws {status:400, codigo:'CIDADE_NAO_CADASTRADA', cidade, sugestoes} no modo estrito
 */
async function resolver(nomeBruto, op = {}) {
    const modo = op.modo === 'tolerante' ? 'tolerante' : 'estrito';
    const bruto = String(nomeBruto == null ? '' : nomeBruto).replace(/\s+/g, ' ').trim();
    if (!bruto) return null;                                   // cidade em branco continua permitida onde já era

    const chave = chaveCidade(bruto);
    const nomeNormalizado = normalizarCidade(bruto);

    // Sentinela "Sem cidade" (rótulo de dashboard que alguém salvou como cidade): não é cidade.
    if (chave === SENTINELA_SEM_CIDADE) {
        if (modo === 'tolerante') return null;
        throw erroCidade(400, 'CIDADE_NAO_CADASTRADA', '"Sem cidade" não é uma cidade — deixe o campo em branco ou escolha da lista.', { cidade: nomeNormalizado, sugestoes: [] });
    }

    const cache = await carregarCache();
    const chaveAlvo = chaveAlvoDe(bruto);
    let cidade = cache.porChave.get(chaveAlvo) || cache.porChave.get(chave) || null;
    let cidadeInativa = null;
    if (cidade) {
        const final = cidade.ativo ? cidade : seguirFusao(cidade, cache);
        if (final && final.ativo) return final.nome;
        cidadeInativa = cidade;                                // inativa sem destino de fusão
    }

    if (modo === 'estrito') {
        const sugestoes = (await sugerir(bruto)).map(s => ({ id: s.id, nome: s.nome, uf: s.uf }));
        throw erroCidade(400, 'CIDADE_NAO_CADASTRADA',
            cidadeInativa
                ? `A cidade "${cidadeInativa.nome}" está inativa no cadastro. Peça para reativá-la em Configurações → Cidades ou escolha outra.`
                : `A cidade "${nomeNormalizado}" não está no cadastro. Escolha uma da lista ou cadastre-a.`,
            { cidade: nomeNormalizado, sugestoes, ...(cidadeInativa ? { cidadeInativa: publica(cidadeInativa) } : {}) });
    }

    // tolerante: grava normalizado e vira pendência (nunca derruba a origem)
    await registrarPendencia({
        chave: chaveAlvo || chave, nomeBruto: bruto, nomeGravado: nomeNormalizado,
        uf: op.uf ? ufDeTexto(op.uf) : null,
        origem: op.origem, exemplo: op.exemplo,
    });
    return nomeNormalizado;
}

/** UF da cidade pelo nome, olhando a tabela (null se não cadastrada / sem UF). */
async function ufDaCidade(nome) {
    const chave = chaveAlvoDe(nome);
    if (!chave) return null;
    const cache = await carregarCache();
    const c = seguirFusao(cache.porChave.get(chave), cache) || cache.porChave.get(chave);
    return c?.uf || null;
}

/**
 * Mapa `chave -> nome oficial` para o backfill/fusão (`backfillCidadesService.nomeFinalDe`):
 * inativa com `fundidaEmId` aponta para o nome do destino. Lê o banco (não o cache): o
 * backfill reescreve dado real e não pode trabalhar com foto de 60 s atrás.
 */
async function mapaParaBackfill() {
    const linhas = await prisma.cidade.findMany();
    const porId = new Map(linhas.map(c => [c.id, c]));
    const mapa = new Map();
    for (const c of linhas) {
        const final = c.ativo ? c : seguirFusao(c, { porId });
        if (final && final.ativo) mapa.set(c.chave, final.nome);
    }
    return mapa;
}

// ─────────────────────────────────────────────────────────────────────────────
// Uso (quantos registros por tabela usam cada cidade) — por CHAVE, não por texto exato
// ─────────────────────────────────────────────────────────────────────────────
const FONTES_USO = [
    { tabela: 'clientes', sql: `SELECT "End_Cidade" AS valor, COUNT(*)::int AS n FROM clientes WHERE "End_Cidade" IS NOT NULL AND btrim("End_Cidade") <> '' GROUP BY 1` },
    { tabela: 'leads', sql: `SELECT cidade AS valor, COUNT(*)::int AS n FROM leads WHERE cidade IS NOT NULL AND btrim(cidade) <> '' GROUP BY 1` },
    { tabela: 'metaCidades', sql: `SELECT cidade AS valor, COUNT(*)::int AS n FROM meta_cidades WHERE cidade IS NOT NULL AND btrim(cidade) <> '' GROUP BY 1` },
    { tabela: 'fornecedores', sql: `SELECT cidade AS valor, COUNT(*)::int AS n FROM fornecedores WHERE cidade IS NOT NULL AND btrim(cidade) <> '' GROUP BY 1` },
    { tabela: 'kitFestaBairros', sql: `SELECT cidade AS valor, COUNT(*)::int AS n FROM kitfesta_bairros WHERE cidade IS NOT NULL AND btrim(cidade) <> '' GROUP BY 1` },
    { tabela: 'catalogos', sql: `SELECT cliente_cidade AS valor, COUNT(*)::int AS n FROM catalogos_personalizados WHERE cliente_cidade IS NOT NULL AND btrim(cliente_cidade) <> '' GROUP BY 1`, composto: true },
];

/** "Joinville · SC" -> "Joinville"; "SC" sozinho -> '' (é UF, não cidade). */
function parteCidadeComposto(valor) {
    const bruto = String(valor == null ? '' : valor);
    const partes = bruto.split('·');
    if (partes.length > 1) return partes[0].trim();
    const unico = bruto.trim();
    return /^[A-Za-z]{2}$/.test(unico) ? '' : unico;
}

/**
 * Map chave(alvo) -> { total, clientes, leads, metaCidades, fornecedores, kitFestaBairros, catalogos,
 * grafias: Set }. Agrupa pela chave ALVO (apelidos do dicionário caem na cidade certa), igual ao
 * que `resolver` faria — é o "quantos registros usam" que a tela mostra e a trava de inativar lê.
 */
async function usoPorChave() {
    const consulta = (sql) => prisma.$queryRawUnsafe(sql).catch((e) => {
        console.error('[cidadeService] falha em fonte de uso:', e.message);
        return [];
    });
    const resultados = await Promise.all(FONTES_USO.map(f => consulta(f.sql)));
    const uso = new Map();
    FONTES_USO.forEach((f, i) => {
        for (const r of resultados[i]) {
            const texto = f.composto ? parteCidadeComposto(r.valor) : r.valor;
            const chave = chaveAlvoDe(texto);
            if (!chave) continue;
            let u = uso.get(chave);
            if (!u) {
                u = { total: 0, grafias: new Set() };
                for (const g of FONTES_USO) u[g.tabela] = 0;
                uso.set(chave, u);
            }
            u[f.tabela] += r.n;
            u.total += r.n;
            u.grafias.add(String(texto).trim());
        }
    });
    return uso;
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────
async function listar({ incluirInativas = false, comUso = true } = {}) {
    const [cidades, uso] = await Promise.all([
        prisma.cidade.findMany({ where: incluirInativas ? {} : { ativo: true } }),
        comUso ? usoPorChave() : Promise.resolve(new Map()),
    ]);
    const lista = cidades.map(c => {
        const u = uso.get(c.chave);
        return {
            ...publica(c),
            criadoEm: c.criadoEm, criadoPor: c.criadoPor, atualizadoEm: c.atualizadoEm,
            registros: u ? u.total : 0,
            uso: u ? {
                clientes: u.clientes, leads: u.leads, metaCidades: u.metaCidades, fornecedores: u.fornecedores,
                kitFestaBairros: u.kitFestaBairros, catalogos: u.catalogos,
                grafias: [...u.grafias].filter(g => g !== c.nome),   // grafias antigas ainda no banco (backfill pendente)
            } : null,
        };
    });
    lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    // Grafias que estão no banco e NÃO batem com cidade nenhuma (dado antigo fora do cadastro).
    const chavesCadastradas = new Set(cidades.map(c => c.chave));
    const foraDoCadastro = [];
    for (const [chave, u] of uso.entries()) {
        if (chavesCadastradas.has(chave) || chave === SENTINELA_SEM_CIDADE) continue;
        foraDoCadastro.push({ chave, grafias: [...u.grafias], registros: u.total });
    }
    foraDoCadastro.sort((a, b) => b.registros - a.registros);
    return { cidades: lista, foraDoCadastro };
}

async function obter(id) {
    const c = await prisma.cidade.findUnique({ where: { id } });
    if (!c) throw erroCidade(404, 'CIDADE_NAO_ENCONTRADA', 'Cidade não encontrada.');
    return c;
}

/**
 * Cria uma cidade. Regras:
 *   · nome vira `normalizarCidade(nome)`; UF obrigatória e válida;
 *   · chave já existe (ativa OU inativa, inclusive via apelido do dicionário) -> 409 CIDADE_JA_EXISTE
 *     com a cidade (o front seleciona / oferece reativar);
 *   · existe parecida e `confirmarParecida` não veio -> 409 CIDADE_PARECIDA com sugestões.
 */
async function criar({ nome, uf, ibge, confirmarParecida } = {}, { usuarioId = null, exigirUf = true } = {}) {
    const nomeNorm = normalizarCidade(nome);
    if (!nomeNorm) throw erroCidade(400, 'NOME_OBRIGATORIO', 'Informe o nome da cidade.');
    if (chaveCidade(nomeNorm) === SENTINELA_SEM_CIDADE) throw erroCidade(400, 'NOME_INVALIDO', '"Sem cidade" não pode ser cadastrada como cidade.');
    const ufNorm = validarUf(uf);
    if (exigirUf && !ufNorm) throw erroCidade(400, 'UF_INVALIDA', 'Informe a UF da cidade (ex.: SC).');

    const chave = chaveAlvoDe(nomeNorm);
    const existente = await prisma.cidade.findUnique({ where: { chave } });
    if (existente) {
        throw erroCidade(409, 'CIDADE_JA_EXISTE',
            existente.ativo ? `A cidade "${existente.nome}" já está cadastrada.` : `A cidade "${existente.nome}" já existe, mas está inativa.`,
            { cidade: publica(existente) });
    }

    if (confirmarParecida !== true) {
        const sugestoes = await sugerir(nomeNorm);
        if (sugestoes.length) {
            throw erroCidade(409, 'CIDADE_PARECIDA',
                `Já existe cidade parecida: ${sugestoes.map(s => s.nome).join(', ')}. Você quis dizer uma delas?`,
                { cidade: nomeNorm, sugestoes });
        }
    }

    const criada = await prisma.cidade.create({
        data: {
            nome: nomeNorm,            // `normalizarCidade` já devolve o nome do dicionário quando é apelido
            uf: ufNorm, chave, ibge: ibge ? String(ibge).trim() : null, criadoPor: usuarioId,
        },
    });
    invalidarCache();
    return publica(criada);
}

/**
 * Edita nome/UF/IBGE. Renomear reescreve o texto nas 6 tabelas pelo motor da fusão (snapshot em
 * ../uploads/backfill-cidades). Mudar só a UF não toca dado nenhum.
 */
async function editar(id, { nome, uf, ibge } = {}, { usuarioId = null } = {}) {
    const atual = await obter(id);
    const data = {};
    let reescrita = null;

    if (uf !== undefined) data.uf = validarUf(uf);
    if (ibge !== undefined) data.ibge = ibge ? String(ibge).trim() : null;

    if (nome !== undefined) {
        const nomeNorm = normalizarCidade(nome);
        if (!nomeNorm) throw erroCidade(400, 'NOME_OBRIGATORIO', 'Informe o nome da cidade.');
        if (nomeNorm !== atual.nome) {
            const chaveNova = chaveAlvoDe(nomeNorm);
            if (chaveNova !== atual.chave) {
                const outra = await prisma.cidade.findUnique({ where: { chave: chaveNova } });
                if (outra) {
                    throw erroCidade(409, 'CIDADE_JA_EXISTE',
                        `Já existe a cidade "${outra.nome}"${outra.ativo ? '' : ' (inativa)'}. Para juntar as duas, use Fundir.`,
                        { cidade: publica(outra) });
                }
            }
            data.nome = nomeNorm;
            data.chave = chaveNova;
        }
    }

    if (!Object.keys(data).length) return { cidade: publica(atual), reescrita: null };

    const salva = await prisma.cidade.update({ where: { id }, data });
    invalidarCache();

    if (data.nome) {
        // A linha já está com o nome novo; agora o texto nas 6 tabelas. Erro aqui NÃO desfaz a
        // edição da linha (o snapshot é o "desfazer"; o resultado vai na resposta).
        const backfill = require('./backfillCidadesService');
        try {
            reescrita = await backfill.fundirCidade({
                deNome: atual.nome, paraNome: salva.nome, dryRun: false, usuarioId, tipo: 'renomear',
            });
        } catch (e) {
            console.error('[cidadeService.editar] falha ao reescrever registros (linha já renomeada):', e.message);
            reescrita = { ok: false, erro: e.message };
        }
    }
    return { cidade: publica(salva), reescrita };
}

async function inativar(id) {
    const c = await obter(id);
    if (!c.ativo) return publica(c);
    const uso = await usoPorChave();
    const u = uso.get(c.chave);
    if (u && u.total > 0) {
        throw erroCidade(400, 'CIDADE_EM_USO',
            `"${c.nome}" está em uso por ${u.total} registro(s). Para inativar, funda-a em outra cidade primeiro.`,
            { registros: u.total, uso: { clientes: u.clientes, leads: u.leads, metaCidades: u.metaCidades, fornecedores: u.fornecedores, kitFestaBairros: u.kitFestaBairros, catalogos: u.catalogos } });
    }
    const salva = await prisma.cidade.update({ where: { id }, data: { ativo: false } });
    invalidarCache();
    return publica(salva);
}

async function reativar(id) {
    const c = await obter(id);
    if (c.ativo) return publica(c);
    const salva = await prisma.cidade.update({ where: { id }, data: { ativo: true, fundidaEmId: null } });
    invalidarCache();
    return publica(salva);
}

/**
 * Fusão A -> B: reescreve todo texto "A" (e grafias antigas da mesma chave) para "B" nas 6
 * tabelas, com snapshot; a origem vira `ativo=false, fundidaEmId=B`. `dryRun` só devolve o plano.
 */
async function fundir(origemId, destinoId, { dryRun = true, usuarioId = null } = {}) {
    if (!destinoId) throw erroCidade(400, 'DESTINO_OBRIGATORIO', 'Informe a cidade de destino (destinoId).');
    if (origemId === destinoId) throw erroCidade(400, 'FUSAO_INVALIDA', 'Origem e destino são a mesma cidade.');
    const origem = await obter(origemId);
    const destino = await obter(destinoId);
    if (!destino.ativo) throw erroCidade(400, 'DESTINO_INATIVO', `A cidade de destino "${destino.nome}" está inativa.`);
    if (!origem.ativo) throw erroCidade(400, 'ORIGEM_INATIVA', `A cidade "${origem.nome}" já está inativa${origem.fundidaEmId ? ' (fundida)' : ''}.`);

    const backfill = require('./backfillCidadesService');
    const resultado = await backfill.fundirCidade({
        deNome: origem.nome, paraNome: destino.nome, dryRun, usuarioId, tipo: 'fusao',
    });
    if (dryRun) return { dryRun: true, origem: publica(origem), destino: publica(destino), ...resultado };

    // Só marca a origem como fundida se a reescrita não falhou: falha parcial deixa a origem
    // ATIVA para o admin repetir (o snapshot já guarda o que foi feito).
    let origemFinal = origem;
    if (resultado.ok !== false) {
        origemFinal = await prisma.cidade.update({ where: { id: origem.id }, data: { ativo: false, fundidaEmId: destino.id } });
        invalidarCache();
    }
    return { dryRun: false, origem: publica(origemFinal), destino: publica(destino), ...resultado };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pendências
// ─────────────────────────────────────────────────────────────────────────────
async function pendentes() {
    const lista = await prisma.cidadePendente.findMany({
        where: { resolvidoEm: null },
        orderBy: [{ ocorrencias: 'desc' }, { criadoEm: 'asc' }],
    });
    const comSugestao = [];
    for (const p of lista) {
        comSugestao.push({
            ...p,
            ufSugerida: p.uf || ufDe(p.chave),
            sugestoes: (await sugerir(p.nomeGravado)).map(s => ({ id: s.id, nome: s.nome, uf: s.uf })),
        });
    }
    return comSugestao;
}

/**
 * Resolve uma pendência: `{ cidadeId }` aponta para uma cidade existente (reescreve os registros
 * com aquela grafia via fusão) ou `{ criar: { nome, uf } }` cadastra e, se o nome cadastrado for
 * diferente do que foi gravado, reescreve também.
 */
async function resolverPendente(id, { cidadeId, criar: dadosCriar } = {}, { usuarioId = null } = {}) {
    const p = await prisma.cidadePendente.findUnique({ where: { id } });
    if (!p) throw erroCidade(404, 'PENDENCIA_NAO_ENCONTRADA', 'Pendência não encontrada.');
    if (p.resolvidoEm) throw erroCidade(400, 'PENDENCIA_JA_RESOLVIDA', 'Esta pendência já foi resolvida.');

    let cidade;
    if (dadosCriar && typeof dadosCriar === 'object') {
        try {
            cidade = await criar({ ...dadosCriar, confirmarParecida: true }, { usuarioId });
        } catch (e) {
            if (e.codigo === 'CIDADE_JA_EXISTE' && e.cidade) cidade = e.cidade.ativo ? e.cidade : await reativar(e.cidade.id);
            else throw e;
        }
    } else if (cidadeId) {
        const c = await obter(cidadeId);
        if (!c.ativo) throw erroCidade(400, 'DESTINO_INATIVO', `A cidade "${c.nome}" está inativa.`);
        cidade = publica(c);
    } else {
        throw erroCidade(400, 'RESOLUCAO_INVALIDA', 'Envie { cidadeId } ou { criar: { nome, uf } }.');
    }

    let reescrita = null;
    if (cidade.nome !== p.nomeGravado) {
        const backfill = require('./backfillCidadesService');
        reescrita = await backfill.fundirCidade({
            deNome: p.nomeGravado, paraNome: cidade.nome, dryRun: false, usuarioId, tipo: 'pendencia',
        });
    }
    const resolvida = await prisma.cidadePendente.update({
        where: { id }, data: { resolvidoEm: new Date(), cidadeId: cidade.id },
    });
    invalidarCache();
    return { pendencia: resolvida, cidade, reescrita };
}

module.exports = {
    resolver,
    sugerir,
    listar,
    obter,
    criar,
    editar,
    inativar,
    reativar,
    fundir,
    pendentes,
    resolverPendente,
    ufDaCidade,
    mapaParaBackfill,
    usoPorChave,
    invalidarCache,
    anotarExemploPendencia,
    chaveAlvoDe,
    publica,
};
