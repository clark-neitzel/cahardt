/**
 * SEMEIA (e depois APAGA) as linhas de `meta_cidades` que reproduzem, no banco LOCAL,
 * os 3 casos reais de colisão que o backfill da Fase 2 vai encontrar em produção.
 *
 * POR QUE ISTO EXISTE
 * -------------------
 * `meta_cidades` no `hardt_local` tem só 2 linhas limpas — o caminho mais delicado do
 * backfill (a FUSÃO de duas linhas que viram a mesma cidade, batendo no
 * `@@unique([metaMensalVendedorId, cidade])`) simplesmente não seria exercitado. Sem
 * semear, o teste local aprovaria um código que nunca rodou o trecho que mais pode
 * quebrar em produção.
 *
 * ⛔ SÓ RODA NO BANCO LOCAL — trava dura em `exigir-banco-local.js`, a mesma que os outros
 * scripts que escrevem no banco já usam. Este script CRIA E APAGA linhas de `meta_cidades`;
 * rodá-lo contra produção destruiria meta de vendedor.
 *
 * A primeira versão desta trava era `DATABASE_URL.includes('hardt_local')` e NÃO travava
 * nada: a substring pode aparecer em qualquer pedaço da URL. O QA apagou linha de verdade
 * em outro banco com
 *     postgresql://user@localhost:5432/hardt_falso_prod?application_name=hardt_local
 * e o mesmo vale para usuário, senha ou host que contenham o texto. `exigir-banco-local.js`
 * faz o certo: parseia a URL, exige host local E nome de banco não-produtivo, e aborta em
 * NODE_ENV=production. Trava de ambiente não se reimplementa à mão.
 *
 * Uso:
 *   node scripts/semear-metas-teste-backfill.js semear   # cria as linhas de teste
 *   node scripts/semear-metas-teste-backfill.js listar   # mostra meta_cidades
 *   node scripts/semear-metas-teste-backfill.js limpar   # apaga TUDO que este script criou
 *
 * A limpeza é pelo prefixo fixo dos ids (`bf2-teste-`), não por "apagar o que sobrou":
 * assim ela nunca encosta numa linha que já existia no banco local.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
require('./exigir-banco-local')('semear-metas-teste-backfill.js'); // ANTES de tocar no banco

const PREFIXO = 'bf2-teste-';

const prisma = require('../config/database');

/**
 * Os 3 casos de produção (diag rodado em 2026-08-27), mais dois casos que produção não
 * tem mas o código precisa cobrir:
 *   · uma colisão que vem de APELIDO do dicionário ("Joinvile" + "Joinville" -> chaves
 *     DIFERENTES que viram o mesmo nome) — é o caso que um agrupamento por `chaveCidade`
 *     deixaria passar;
 *   · uma mudança SIMPLES, sem colisão ("ITAPOA" sozinha numa meta) — o outro caminho;
 *   · duas linhas "Sem cidade", que TÊM que sair intactas (a sentinela do dicionário faz
 *     `normalizarCidade` virar no-op).
 */
const CASOS = [
    // meta 1 — Letícia (produção: Joinville 107.132,05 + JOINVILLE 231,00 -> 107.363,05)
    { meta: 0, id: 'a1', cidade: 'Joinville', valor: 107132.05, dias: 'N/D,SEG,TER,QUA,QUI,SEX' },
    { meta: 0, id: 'a2', cidade: 'JOINVILLE', valor: 231.00, dias: 'N/D' },
    { meta: 0, id: 'a3', cidade: 'Sem cidade', valor: 500.00, dias: 'N/D' },

    // meta 2 — Jociel (produção: 2 colisões na mesma meta)
    { meta: 1, id: 'b1', cidade: 'Joinville', valor: 19545.02, dias: 'SEG,QUA,QUI,SEX' },
    { meta: 1, id: 'b2', cidade: 'JOINVILLE', valor: 177.94, dias: 'QUA' },
    { meta: 1, id: 'b3', cidade: 'ITAPOA', valor: 243.22, dias: 'SEG' },
    { meta: 1, id: 'b4', cidade: 'Itapoá', valor: 6403.04, dias: 'SEG' },
    { meta: 1, id: 'b5', cidade: 'Sem cidade', valor: 300.00, dias: 'N/D' },

    // meta 3 — casos que produção não tem, mas o código precisa cobrir
    { meta: 2, id: 'c1', cidade: 'Joinville', valor: 1000.00, dias: 'TER' },
    { meta: 2, id: 'c2', cidade: 'Joinvile', valor: 250.00, dias: 'SEX' },   // apelido -> funde com c1
    { meta: 2, id: 'c3', cidade: 'ITAPOA', valor: 800.00, dias: 'QUI' },     // sozinha -> update simples
];

async function metasDisponiveis() {
    // SÓ metas que ainda não têm nenhuma linha de cidade. O banco local já traz metas com
    // cidade cadastrada, e escrever "Joinville" numa delas estouraria o
    // `@@unique([metaMensalVendedorId, cidade])` — o teste morreria antes de começar, e o
    // pior: encostando em dado que já estava lá.
    const metas = (await prisma.metaMensalVendedor.findMany({
        select: {
            id: true, mesReferencia: true,
            vendedor: { select: { nome: true } },
            _count: { select: { metasCidades: true } },
        },
        orderBy: { id: 'asc' },
    })).filter(m => m._count.metasCidades === 0).slice(0, 3);
    if (metas.length < 3) {
        throw new Error(`o banco local tem só ${metas.length} meta(s) mensal(is) SEM cidade; o teste precisa de 3.`);
    }
    return metas;
}

async function semear() {
    const metas = await metasDisponiveis();
    // Apaga qualquer sobra de uma execução anterior antes de recriar (o @@unique não
    // deixaria "Joinville" entrar duas vezes na mesma meta).
    await limpar({ silencioso: true });

    for (const c of CASOS) {
        await prisma.metaCidade.create({
            data: {
                id: PREFIXO + c.id,
                metaMensalVendedorId: metas[c.meta].id,
                cidade: c.cidade,
                valor: c.valor,
                diasSemana: c.dias,
            },
        });
    }
    console.log(`semeadas ${CASOS.length} linhas de teste em ${metas.length} metas:`);
    metas.forEach((m, i) => console.log(`  meta ${i}: ${m.id}  ${m.vendedor?.nome || '?'} ${m.mesReferencia}`));
    await listar();
}

async function limpar({ silencioso = false } = {}) {
    const r = await prisma.metaCidade.deleteMany({ where: { id: { startsWith: PREFIXO } } });
    if (!silencioso) {
        console.log(`apagadas ${r.count} linha(s) de teste (id começando com "${PREFIXO}").`);
        await listar();
    }
    return r.count;
}

async function listar() {
    const linhas = await prisma.metaCidade.findMany({
        select: { id: true, metaMensalVendedorId: true, cidade: true, valor: true, diasSemana: true },
        orderBy: [{ metaMensalVendedorId: 'asc' }, { cidade: 'asc' }],
    });
    console.log(`\nmeta_cidades agora: ${linhas.length} linha(s)`);
    for (const l of linhas) {
        const teste = l.id.startsWith(PREFIXO) ? ' [TESTE]' : '';
        console.log(`  ${l.id.padEnd(38)} ${String(l.cidade).padEnd(22)} ${String(l.valor).padStart(12)}  ${l.diasSemana || '-'}${teste}`);
    }
}

const comando = process.argv[2] || 'listar';
const acoes = { semear, limpar: () => limpar({}), listar };
if (!acoes[comando]) {
    console.error(`comando desconhecido: ${comando} (use semear | limpar | listar)`);
    process.exit(2);
}
acoes[comando]()
    .catch((e) => { console.error('ERRO:', e.message); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
