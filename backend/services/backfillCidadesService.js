/**
 * BACKFILL DE CIDADES — FASE 2 (a fase que REESCREVE dado antigo de produção).
 *
 * O QUE É
 * -------
 * A Fase 1 (commit 6d34938f, já no ar) fechou a torneira: todo ponto onde cidade ENTRA
 * no sistema passa por `normalizarCidade()`, então não nasce mais grafia divergente. Ela
 * NÃO mexeu em nada que já estava gravado. Esta fase mexe: reescreve as grafias antigas
 * ("JOINVILLE", "Jaraguá do sul ", "ITAPOA", "Joiville") para o nome oficial.
 *
 * POR QUE ISSO IMPORTA (não é cosmético)
 * --------------------------------------
 * Quem casa cidade faz lookup EXATO. Em `services/comissaoService.js` o realizado por
 * cidade é lido com `realizadoPorCidade[mc.cidade] || 0`: meta em "Itapoá" contra pedidos
 * em "ITAPOA" devolve 0, `bateu` fica false EM SILÊNCIO e o vendedor perde bônus sem
 * ninguém ver erro. Metas e dashboards ainda mostram a mesma cidade em duas linhas.
 *
 * A REGRA DE REESCRITA É A MESMA DA GRAVAÇÃO
 * ------------------------------------------
 * O nome final de cada valor é `normalizarCidade(valor)` — exatamente a função que a
 * Fase 1 usa nos 14 pontos de entrada. NÃO usamos `decidirNomeFinal` (a regra do
 * diagnóstico) aqui, de propósito: aquela escolhe "a acentuada mais frequente do grupo",
 * que pode produzir um nome que a GRAVAÇÃO nunca produziria — o backfill deixaria de ser
 * idempotente e o `syncPedidosModificados` re-sujaria o dado no dia seguinte. Usando a
 * MESMA função dos dois lados, rodar de novo afeta 0 linhas (provado em
 * `scripts/teste-backfill-cidades.js` e pelo `conferenciaDepois` da própria rota).
 *
 * O QUE **NÃO** É TOCADO
 * ----------------------
 * · `catalogos_personalizados.cliente_cidade` — é SNAPSHOT histórico do que o cliente viu
 *   no link público `/lista/:token`. Reescrever histórico não traz ganho e traz risco.
 * · Linhas de `meta_cidades` com o texto "Sem cidade" — a sentinela de CIDADES_CANONICAS
 *   faz `normalizarCidade('Sem cidade') === 'Sem cidade'`, então elas caem naturalmente em
 *   "não muda". NÃO existe exceção especial no código para elas: se a sentinela sair do
 *   dicionário um dia, o dry-run passa a mostrá-las — que é o comportamento certo, e não
 *   uma regra escondida aqui.
 * · Valores em branco / só espaço: `normalizarCidade` devolveria `null`, e gravar null é
 *   uma mudança que ninguém aprovou. Ficam listados em `ignoradosEmBranco`.
 *
 * TRAVA DE APROVAÇÃO — é ela que casa este backfill com a lista que o dono aprovou
 * ---------------------------------------------------------------------------------
 * O dono aprovou o DICIONÁRIO (`CIDADES_CANONICAS`), uma linha por vez, sobre a saída de
 * `GET /api/admin-exec/diag-cidades`. Mudança cuja chave NÃO está no dicionário só é
 * aplicada com `permitirForaDoDicionario: true` no corpo — exceto quando a diferença é só
 * espaço sobrando ("Blumenau " -> "Blumenau"), que não inventa letra nenhuma.
 *
 * O motivo é mais forte do que "Title Case pode errar o acento". As duas regras — a da
 * GRAVAÇÃO (`normalizarCidade`, usada aqui) e a do DIAGNÓSTICO (`decidirNomeFinal`, que
 * montou a lista aprovada) — REALMENTE DIVERGEM fora do dicionário: uma dá o Title Case da
 * própria grafia, sem acento; a outra dá a grafia acentuada mais frequente do grupo. Que
 * hoje elas coincidam nas 122 variantes de produção é uma foto, não uma garantia.
 *
 * A garantia é ESTRUTURAL: exatamente os casos em que as duas divergem são os que caem em
 * `tituloAutomatico`, e a trava os bloqueia. Com a trava ligada (o padrão), este backfill
 * NUNCA grava um nome diferente do que o diagnóstico mostrou ao dono. Ligar
 * `permitirForaDoDicionario` fura essa garantia — ver `AVISO_FORA_DO_DICIONARIO`, que vai
 * na resposta da API para não ficar só neste comentário. Hoje a lista sai VAZIA: os 18
 * grupos que mudam estão todos no dicionário.
 *
 * SNAPSHOT DE REVERSÃO
 * --------------------
 * Antes de escrever qualquer coisa, grava `id -> valor antigo` de cada linha em
 * `backend/uploads/backfill-cidades/`. `backend/uploads/` é o ÚNICO caminho que sobrevive
 * ao deploy (volume). `../../uploads` cairia em `/uploads`, fora do volume, e o arquivo
 * sumiria no deploy seguinte SEM ERRO NENHUM — foi assim que se perderam 14 documentos do
 * Contas a Pagar em 07/2026. Este arquivo está em `backend/services/`, um nível abaixo de
 * `backend/`, então `../uploads` é `/app/uploads` no container (o mesmo que `routes/`).
 */
const path = require('path');
const fs = require('fs/promises');
const prisma = require('../config/database');
const { chaveCidade, normalizarCidade, CIDADES_CANONICAS } = require('../utils/cidade');
// A fusão de metas usa EXATAMENTE a mesma função da gravação (`services/metaService.js`),
// para o que o dono aprovou na lista ser bit a bit o que o backfill grava.
// `deduplicarMetasCidades` chama `unirDiasSemana` por dentro (soma dos valores + união dos
// dias, com o dia desconhecido "N/D" preservado no fim da ordem canônica da semana).
const { deduplicarMetasCidades } = require('../utils/metaCidadeMerge');

/** Pasta do snapshot. services/ está um nível abaixo de backend/ -> /app/uploads no container. */
const DIR_SNAPSHOTS = path.join(__dirname, '../uploads/backfill-cidades');

/**
 * Ordem de execução. NÃO há FK entre estas tabelas; a ordem é por RISCO — do dado mais
 * volumoso e mais simples (cliente: um `updateMany` por variante, usando o
 * `@@index([End_Cidade])`) para o mais delicado (meta_cidades, que tem
 * `@@unique([metaMensalVendedorId, cidade])` e por isso precisa de fusão caso a caso).
 */
const ALVOS = [
    { chave: 'clientes', model: 'cliente', rotulo: 'Cliente', campo: 'End_Cidade', pk: 'UUID' },
    { chave: 'leads', model: 'lead', rotulo: 'Lead', campo: 'cidade', pk: 'id' },
    { chave: 'fornecedores', model: 'fornecedor', rotulo: 'Fornecedor', campo: 'cidade', pk: 'id' },
    { chave: 'kitFestaBairros', model: 'kitFestaBairro', rotulo: 'KitFestaBairro', campo: 'cidade', pk: 'id' },
];

/**
 * De onde vem o nome novo desta mudança — é o que decide se ela pode ser aplicada sem uma
 * segunda aprovação do dono.
 *   'dicionario'       -> a chave está em CIDADES_CANONICAS (o dono aprovou uma a uma).
 *   'espacos'          -> a única diferença é espaço sobrando/duplicado. Não inventa letra.
 *   'tituloAutomatico' -> Title Case puro. PODE inventar grafia errada quando o dado perdeu
 *                         o acento ("SAO BENTO" -> "Sao Bento"). Só com permissão explícita.
 */
function classificarMudanca(valor, nomeFinal) {
    if (Object.prototype.hasOwnProperty.call(CIDADES_CANONICAS, chaveCidade(valor))) return 'dicionario';
    if (String(valor).replace(/\s+/g, ' ').trim() === nomeFinal) return 'espacos';
    return 'tituloAutomatico';
}

const APROVADAS_POR_PADRAO = new Set(['dicionario', 'espacos']);

/**
 * AVISO que acompanha toda resposta com `permitirForaDoDicionario: true`.
 *
 * A conferência apurou por que a trava importa, e não é o que estava escrito antes aqui.
 * `normalizarCidade` (a regra da GRAVAÇÃO, usada por este backfill) e `decidirNomeFinal`
 * (a regra do DIAGNÓSTICO, que montou a lista que o dono aprovou) **divergem de fato**
 * fora do dicionário: uma devolve o Title Case da própria grafia, sem acento; a outra
 * devolve a grafia acentuada mais frequente do grupo. Hoje elas dão o mesmo resultado nas
 * 122 variantes de produção — mas isso é uma FOTO de hoje, não uma garantia.
 *
 * O que garante é estrutural: exatamente os casos onde as duas divergem são os que caem em
 * `tituloAutomatico`, e a trava os bloqueia. Ou seja, sem `permitirForaDoDicionario` o
 * backfill NUNCA grava um nome diferente do que o diagnóstico propôs ao dono.
 *
 * Ligar a permissão fura essa proteção: passa a ser possível gravar nome que a tela nunca
 * mostrou ao dono (o clássico "SAO BENTO DO SUL" -> "Sao Bento do Sul", sem acento).
 * Por isso o aviso vai na resposta da API, não só num comentário que ninguém lê.
 */
const AVISO_FORA_DO_DICIONARIO =
    'permitirForaDoDicionario LIGADO: as mudanças classificadas como "tituloAutomatico" '
    + 'são gravadas com Title Case puro, que NÃO devolve acento perdido ("SAO BENTO DO SUL" '
    + '-> "Sao Bento do Sul"). Esse nome pode ser DIFERENTE do que o diag-cidades propôs ao '
    + 'dono (lá a regra é a grafia acentuada mais frequente do grupo). Confira uma a uma a '
    + 'lista de "mudancasSemAprovacao" do dry-run antes de confirmar — o caminho seguro é '
    + 'acrescentar a linha em CIDADES_CANONICAS, com aprovação, em vez de ligar isto.';

/** Decimal do Prisma -> número simples (o snapshot é JSON e a soma precisa de número). */
const num = (v) => (v == null ? 0 : Number(v));

/** Host/banco sem credencial — para o snapshot dizer de qual banco ele veio. */
function bancoDoAmbiente() {
    try {
        const u = new URL(process.env.DATABASE_URL || '');
        return `${u.host}${u.pathname}`;
    } catch { return null; }
}

// ============================================================================
// 1) PLANO — só LEITURA. É o que o dry-run devolve e o que o `aplicar` executa.
// ============================================================================
async function montarPlano({ permitirForaDoDicionario = false } = {}) {
    const tabelas = [];
    const ignoradosEmBranco = [];
    const semAprovacao = [];

    // ------------------------------------------------------- tabelas simples
    for (const alvo of ALVOS) {
        // id + cidade de todas as linhas com cidade preenchida. São poucos milhares somando
        // as 4 tabelas (clientes ~1.200 em produção) e precisamos dos IDs de qualquer jeito
        // para o snapshot de reversão — puxar de uma vez sai mais barato que um GROUP BY
        // seguido de um findMany por variante.
        const linhas = await prisma[alvo.model].findMany({
            where: { [alvo.campo]: { not: null } },
            select: { [alvo.pk]: true, [alvo.campo]: true },
        });

        const porValor = new Map();
        for (const l of linhas) {
            const valor = l[alvo.campo];
            if (!porValor.has(valor)) porValor.set(valor, []);
            porValor.get(valor).push(l[alvo.pk]);
        }

        const variantes = [];
        for (const [valor, ids] of porValor.entries()) {
            const nomeFinal = normalizarCidade(valor);
            if (!nomeFinal) {
                // Só espaço. Gravar null seria uma mudança que ninguém aprovou — o valor
                // fica como está e SEMPRE aparece em `ignoradosEmBranco`, para o dono ver
                // que existe e decidir. (A versão anterior tinha aqui um
                // `if (valor.trim() !== '')` que era ramo MORTO: `normalizarCidade` só
                // devolve null quando o trim é vazio, então a lista saía sempre vazia e o
                // caso "só espaço" sumia em silêncio — o oposto do que o cabeçalho promete.)
                ignoradosEmBranco.push({ tabela: alvo.chave, valor, linhas: ids.length });
                continue;
            }
            if (valor === nomeFinal) continue;               // já está no nome oficial
            const classificacao = classificarMudanca(valor, nomeFinal);
            const aplicar = APROVADAS_POR_PADRAO.has(classificacao) || permitirForaDoDicionario;
            if (!aplicar) {
                semAprovacao.push({ tabela: alvo.chave, de: valor, para: nomeFinal, linhas: ids.length });
            }
            variantes.push({ de: valor, para: nomeFinal, linhas: ids.length, classificacao, seraAplicado: aplicar, ids });
        }
        variantes.sort((a, b) => (b.linhas - a.linhas) || a.de.localeCompare(b.de, 'pt-BR'));

        tabelas.push({
            tabela: alvo.chave, model: alvo.rotulo, campo: alvo.campo, pk: alvo.pk,
            variantes,
            linhasQueMudam: variantes.filter(v => v.seraAplicado).reduce((t, v) => t + v.linhas, 0),
        });
    }

    // ------------------------------------------------- fornecedores.uf (de carona)
    // "já que estamos ali": UF em minúscula ('sc') vira 'SC'. SÓ se já for sigla de 2 letras
    // — coerente com a decisão da Fase 1 em `routes/fornecedores.js`: 'Santa Catarina' NÃO
    // vira 'SA'. Cortar cego em 2 caracteres inventaria uma UF inexistente que passa por
    // válida em todo relatório que filtra por estado.
    const fornecedores = await prisma.fornecedor.findMany({
        where: { uf: { not: null } },
        select: { id: true, uf: true },
    });
    const ufMudancas = [];
    for (const f of fornecedores) {
        const bruto = String(f.uf).trim();
        if (!/^[A-Za-z]{2}$/.test(bruto)) continue;          // 'Santa Catarina', 'S', '' -> não mexe
        const alvoUf = bruto.toUpperCase();
        if (f.uf === alvoUf) continue;
        ufMudancas.push({ id: f.id, de: f.uf, para: alvoUf });
    }

    // ------------------------------------------------------------ meta_cidades
    // POR ÚLTIMO e CASO A CASO: `@@unique([metaMensalVendedorId, cidade])` faz o `updateMany`
    // estourar P2002 quando duas linhas da MESMA meta viram o mesmo nome ("Joinville" +
    // "JOINVILLE"). Em produção são 3 casos, todos aprovados pelo dono para SOMAR.
    const metasCidades = await prisma.metaCidade.findMany({
        select: {
            id: true, metaMensalVendedorId: true, cidade: true, valor: true, diasSemana: true,
            createdAt: true,
            metaMensalVendedor: {
                select: { mesReferencia: true, vendedor: { select: { nome: true } } },
            },
        },
    });

    // Agrupa por (meta, NOME FINAL). Agrupar pelo nome final — e não pela chave de comparação
    // — é o que enxerga também a colisão criada pelos APELIDOS do dicionário: meta em
    // "Joiville" e meta em "Joinville" são chaves diferentes e viram a MESMA linha.
    const porMetaENome = new Map();
    for (const m of metasCidades) {
        const nomeFinal = normalizarCidade(m.cidade);
        if (!nomeFinal) {
            // Mesmo caso das tabelas simples: só espaço. Não mexe, mas REPORTA.
            ignoradosEmBranco.push({ tabela: 'metaCidades', valor: m.cidade, linhas: 1, id: m.id });
            continue;
        }
        const k = `${m.metaMensalVendedorId} ${nomeFinal}`;
        if (!porMetaENome.has(k)) porMetaENome.set(k, { nomeFinal, linhas: [] });
        porMetaENome.get(k).linhas.push(m);
    }

    const metaSimples = [];
    const metaMerges = [];
    for (const grupo of porMetaENome.values()) {
        const { nomeFinal, linhas } = grupo;

        if (linhas.length === 1) {
            const m = linhas[0];
            if (m.cidade === nomeFinal) continue;            // não muda (é o caso de "Sem cidade")
            const classificacao = classificarMudanca(m.cidade, nomeFinal);
            const aplicar = APROVADAS_POR_PADRAO.has(classificacao) || permitirForaDoDicionario;
            if (!aplicar) {
                semAprovacao.push({ tabela: 'metaCidades', de: m.cidade, para: nomeFinal, linhas: 1 });
                continue;
            }
            metaSimples.push({
                id: m.id, de: m.cidade, para: nomeFinal, classificacao,
                vendedor: m.metaMensalVendedor?.vendedor?.nome || null,
                mes: m.metaMensalVendedor?.mesReferencia || null,
            });
            continue;
        }

        // --- FUSÃO: duas ou mais linhas da mesma meta que viram a mesma cidade -----------
        // A "vencedora" é a linha que FICA (mantém id e created_at). Critério, nesta ordem:
        // (1) a que já está com o nome oficial — costuma ser a meta de verdade, a outra é o
        // resto que entrou com grafia torta; (2) a de maior valor; (3) o id, só para o
        // resultado ser estável entre execuções e o dry-run bater com o que vai ser gravado.
        const ordenadas = [...linhas].sort((a, b) =>
            (Number(b.cidade === nomeFinal) - Number(a.cidade === nomeFinal))
            || (num(b.valor) - num(a.valor))
            || a.id.localeCompare(b.id));

        const naoAprovada = ordenadas.find(m => m.cidade !== nomeFinal
            && !APROVADAS_POR_PADRAO.has(classificarMudanca(m.cidade, nomeFinal)));
        if (naoAprovada && !permitirForaDoDicionario) {
            semAprovacao.push({
                tabela: 'metaCidades', de: naoAprovada.cidade, para: nomeFinal,
                linhas: ordenadas.length, fusao: true,
            });
            continue;                                        // a fusão inteira fica de fora
        }

        // A regra (soma dos valores + união dos dias) vem da MESMA função que a tela de metas
        // usa ao salvar. Não é uma segunda implementação: é a mesma.
        const { cidades } = deduplicarMetasCidades(ordenadas.map(m => ({
            cidade: m.cidade, valor: num(m.valor), diasSemana: m.diasSemana,
        })));
        const aplicado = cidades[0];
        const vencedora = ordenadas[0];

        metaMerges.push({
            metaMensalVendedorId: vencedora.metaMensalVendedorId,
            vendedor: vencedora.metaMensalVendedor?.vendedor?.nome || null,
            mes: vencedora.metaMensalVendedor?.mesReferencia || null,
            nomeFinal,
            antes: ordenadas.map(m => ({
                id: m.id, cidade: m.cidade, valor: num(m.valor), diasSemana: m.diasSemana,
                papel: m.id === vencedora.id ? 'FICA' : 'APAGADA',
            })),
            depois: {
                id: vencedora.id, cidade: aplicado.cidade,
                valor: aplicado.valor, diasSemana: aplicado.diasSemana,
            },
            regra: 'soma dos valores + união dos dias (mesma regra da tela de metas)',
            // Cru, para o snapshot conseguir RECRIAR a linha apagada inteira.
            _vencedora: vencedora,
            _perdedoras: ordenadas.slice(1),
            _aplicado: aplicado,
        });
    }

    metaSimples.sort((a, b) => String(a.de).localeCompare(String(b.de), 'pt-BR'));
    metaMerges.sort((a, b) => (b.antes.length - a.antes.length)
        || String(a.nomeFinal).localeCompare(String(b.nomeFinal), 'pt-BR'));

    // Linhas de meta efetivamente tocadas: as simples + todas as linhas envolvidas em fusão
    // (a que fica muda de valor/dias, as outras somem).
    const metaLinhasTocadas = metaSimples.length
        + metaMerges.reduce((t, m) => t + m.antes.length, 0);

    const totalLinhas = tabelas.reduce((t, x) => t + x.linhasQueMudam, 0)
        + ufMudancas.length + metaLinhasTocadas;

    return {
        tabelas, ufMudancas, metaSimples, metaMerges,
        ignoradosEmBranco, semAprovacao,
        permitirForaDoDicionario,
        resumo: {
            registrosQueMudam: {
                clientes: tabelas.find(t => t.tabela === 'clientes').linhasQueMudam,
                leads: tabelas.find(t => t.tabela === 'leads').linhasQueMudam,
                fornecedores: tabelas.find(t => t.tabela === 'fornecedores').linhasQueMudam,
                kitFestaBairros: tabelas.find(t => t.tabela === 'kitFestaBairros').linhasQueMudam,
                metaCidades: metaLinhasTocadas,
                catalogos: 0,   // NÃO backfillado de propósito (snapshot histórico do link público)
            },
            fornecedoresUfCorrigida: ufMudancas.length,
            metaFusoes: metaMerges.length,
            metaLinhasApagadasNaFusao: metaMerges.reduce((t, m) => t + m._perdedoras.length, 0),
            mudancasSemAprovacao: semAprovacao.length,
            valoresIgnoradosEmBranco: ignoradosEmBranco.length,
            totalLinhas,
            // Rodar de novo tem que dar zero aqui. `false` depois de aplicar = algo ficou para trás.
            nadaAFazer: totalLinhas === 0,
        },
    };
}

/** A parte do plano que vai para a resposta HTTP (sem os campos crus `_*` e sem a lista de ids). */
function planoParaResposta(plano) {
    return {
        resumo: plano.resumo,
        // Só aparece quando a trava foi furada — em operação normal o campo nem existe.
        ...(plano.permitirForaDoDicionario ? { avisoForaDoDicionario: AVISO_FORA_DO_DICIONARIO } : {}),
        catalogosPersonalizados: 'NÃO backfillado de propósito — cliente_cidade é snapshot histórico do link público /lista/:token',
        tabelas: plano.tabelas.map(t => ({
            tabela: t.tabela, model: t.model, campo: t.campo,
            linhasQueMudam: t.linhasQueMudam,
            variantes: t.variantes.map(({ ids, ...v }) => v),
        })),
        fornecedoresUf: plano.ufMudancas,
        metaCidades: {
            simples: plano.metaSimples,
            fusoes: plano.metaMerges.map(({ _vencedora, _perdedoras, _aplicado, ...m }) => m),
        },
        ignoradosEmBranco: plano.ignoradosEmBranco,
        mudancasSemAprovacao: plano.semAprovacao,
    };
}

// ============================================================================
// 2) SNAPSHOT — gravado ANTES de qualquer escrita.
// ============================================================================
function montarSnapshot(plano, nomeArquivo) {
    return {
        versao: 1,
        arquivo: nomeArquivo,
        tipo: 'backfill-cidades',
        geradoEm: new Date().toISOString(),
        banco: bancoDoAmbiente(),
        permitirForaDoDicionario: plano.permitirForaDoDicionario,
        // id -> valor antigo, por model. É isto que a reversão lê.
        tabelas: plano.tabelas.map(t => ({
            tabela: t.tabela, model: t.model, campo: t.campo, pk: t.pk,
            linhas: t.variantes.filter(v => v.seraAplicado)
                .flatMap(v => v.ids.map(id => ({ id, de: v.de, para: v.para }))),
        })),
        fornecedorUf: plano.ufMudancas,
        metaSimples: plano.metaSimples.map(m => ({ id: m.id, de: m.de, para: m.para })),
        // Na fusão o snapshot guarda a LINHA INTEIRA da(s) apagada(s) — sem isso não há como
        // recriá-la. E guarda o estado ANTERIOR da que fica (cidade, valor e dias mudam).
        metaMerges: plano.metaMerges.map(m => ({
            metaMensalVendedorId: m.metaMensalVendedorId,
            nomeFinal: m.nomeFinal,
            vencedoraAntes: {
                id: m._vencedora.id,
                metaMensalVendedorId: m._vencedora.metaMensalVendedorId,
                cidade: m._vencedora.cidade,
                valor: num(m._vencedora.valor),
                diasSemana: m._vencedora.diasSemana,
            },
            aplicado: {
                cidade: m._aplicado.cidade, valor: m._aplicado.valor, diasSemana: m._aplicado.diasSemana,
            },
            apagadas: m._perdedoras.map(p => ({
                id: p.id,
                metaMensalVendedorId: p.metaMensalVendedorId,
                cidade: p.cidade,
                valor: num(p.valor),
                diasSemana: p.diasSemana,
                createdAt: p.createdAt ? p.createdAt.toISOString() : null,
            })),
        })),
    };
}

async function gravarSnapshot(snapshot) {
    await fs.mkdir(DIR_SNAPSHOTS, { recursive: true });
    const destino = path.join(DIR_SNAPSHOTS, snapshot.arquivo);
    await fs.writeFile(destino, JSON.stringify(snapshot, null, 2), 'utf8');
    return destino;
}

/** Lista o que existe na pasta do volume. É também o jeito de PROVAR que sobreviveu ao deploy. */
async function listarSnapshots() {
    try {
        const nomes = (await fs.readdir(DIR_SNAPSHOTS)).filter(n => n.endsWith('.json'));
        const itens = [];
        for (const nome of nomes) {
            const completo = path.join(DIR_SNAPSHOTS, nome);
            const st = await fs.stat(completo);
            let cabecalho = {};
            try {
                const j = JSON.parse(await fs.readFile(completo, 'utf8'));
                cabecalho = {
                    geradoEm: j.geradoEm || null, banco: j.banco || null,
                    aplicadoEm: j.aplicadoEm || null, revertidoEm: j.revertidoEm || null,
                    linhas: (j.tabelas || []).reduce((t, x) => t + (x.linhas ? x.linhas.length : 0), 0)
                        + (j.fornecedorUf ? j.fornecedorUf.length : 0)
                        + (j.metaSimples ? j.metaSimples.length : 0),
                    fusoesDeMeta: j.metaMerges ? j.metaMerges.length : 0,
                };
            } catch { cabecalho = { erro: 'arquivo ilegível' }; }
            itens.push({ arquivo: nome, bytes: st.size, modificadoEm: st.mtime.toISOString(), ...cabecalho });
        }
        // Nome começa com a data ISO, então ordem alfabética decrescente = mais recente primeiro.
        itens.sort((a, b) => b.arquivo.localeCompare(a.arquivo));
        return { pasta: DIR_SNAPSHOTS, total: itens.length, snapshots: itens };
    } catch (e) {
        if (e.code === 'ENOENT') {
            return { pasta: DIR_SNAPSHOTS, total: 0, snapshots: [], aviso: 'pasta ainda não existe (nenhum backfill aplicado)' };
        }
        throw e;
    }
}

// ============================================================================
// 3) APLICAR
// ============================================================================
/**
 * TRAVA DE CLIQUE DUPLO (item 9 da conferência).
 *
 * Sem isto, dois `confirmar: true` disparados quase juntos montam DOIS planos sobre o
 * mesmo estado e gravam DOIS snapshots para a mesma mudança. O dado em si fica íntegro
 * (as escritas são absolutas e a fusão é atômica), mas a trilha de reversão fica suja:
 * dois arquivos dizendo que apagaram as mesmas linhas, e o segundo com contagem zerada.
 *
 * É um mutex DE PROCESSO — não protege contra duas réplicas do backend. Hoje o backend
 * roda numa instância só no EasyPanel; se um dia rodar em duas, isto vira lock no banco.
 * A limitação está dita aqui de propósito, para ninguém confiar mais do que ela vale.
 * O mesmo cadeado cobre `reverter`: aplicar e reverter ao mesmo tempo seria pior ainda.
 */
let _emAndamento = null;

async function aplicar({ permitirForaDoDicionario = false } = {}) {
    if (_emAndamento) {
        return { ok: false, aplicado: false, erro: `já existe um "${_emAndamento}" em andamento — espere terminar` };
    }
    _emAndamento = 'backfill-cidades';
    try {
        return await aplicarDeVerdade({ permitirForaDoDicionario });
    } finally {
        _emAndamento = null;
    }
}

async function aplicarDeVerdade({ permitirForaDoDicionario }) {
    const plano = await montarPlano({ permitirForaDoDicionario });
    const resposta = planoParaResposta(plano);

    if (plano.resumo.totalLinhas === 0) {
        return {
            ok: true, aplicado: false,
            motivo: 'nada a fazer — o banco já está no nome oficial',
            snapshot: null, ...resposta,
        };
    }

    const nomeArquivo = `backfill-cidades-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const snapshot = montarSnapshot(plano, nomeArquivo);
    // GRAVA O SNAPSHOT ANTES DE ESCREVER NO BANCO. Se isto falhar, nada é alterado: sem
    // como voltar atrás, não se mexe em dado de produção.
    const caminhoSnapshot = await gravarSnapshot(snapshot);

    const efeitos = { tabelas: {}, fornecedoresUf: 0, metaSimples: 0, metaFusoes: 0, metaApagadas: 0 };
    const previsto = { tabelas: {}, fornecedoresUf: plano.ufMudancas.length, metaSimples: plano.metaSimples.length, metaFusoes: plano.metaMerges.length, metaApagadas: plano.metaMerges.reduce((t, m) => t + m._perdedoras.length, 0) };
    const falhas = [];

    // -------- 1..4) tabelas simples: um `updateMany` POR VARIANTE, PELA LISTA DE IDs -----
    // Nada de uma `$transaction` gigante em volta: são poucas dezenas de statements
    // independentes, cada um rápido, e uma transação longa segurando lock em `clientes` em
    // horário de pico é exatamente o que a regra do projeto manda evitar. O "desfazer" aqui
    // é o snapshot, não o rollback.
    //
    // O `where` é `PK IN (ids do plano) AND campo = valor antigo` — a MESMA forma que a
    // reversão sempre usou. A primeira versão filtrava só pelo valor (`cidade = 'JOINVILLE'`)
    // para usar o `@@index([End_Cidade])`, e isso abria uma corrida real, reproduzida pelo
    // QA: uma linha criada com a grafia velha ENTRE o plano e o update era corrigida junto,
    // NÃO entrava no snapshot, e a reversão devolvia `ok: true` deixando-a corrigida para
    // sempre — em silêncio. Pela lista de ids a classe inteira desaparece: o backfill toca
    // exatamente as linhas que registrou. `id = ANY(array)` com ~900 ids é index scan de
    // chave primária, barato; e a guarda `campo = valor antigo` faz a contagem significar
    // alguma coisa (linha que alguém editou no meio não é sobrescrita e some da conta).
    for (const t of plano.tabelas) {
        const alvo = ALVOS.find(a => a.chave === t.tabela);
        let linhas = 0;
        let linhasPrevistas = 0;
        for (const v of t.variantes) {
            if (!v.seraAplicado) continue;
            linhasPrevistas += v.ids.length;
            try {
                const r = await prisma[alvo.model].updateMany({
                    where: { [alvo.pk]: { in: v.ids }, [t.campo]: v.de },
                    data: { [t.campo]: v.para },
                });
                linhas += r.count;
            } catch (e) {
                falhas.push({ tabela: t.tabela, de: v.de, para: v.para, erro: e.message });
            }
        }
        efeitos.tabelas[t.tabela] = linhas;
        previsto.tabelas[t.tabela] = linhasPrevistas;
    }

    // -------- fornecedores.uf --------
    for (const u of plano.ufMudancas) {
        try {
            const r = await prisma.fornecedor.updateMany({ where: { id: u.id, uf: u.de }, data: { uf: u.para } });
            efeitos.fornecedoresUf += r.count;
        } catch (e) {
            falhas.push({ tabela: 'fornecedores.uf', id: u.id, erro: e.message });
        }
    }

    // -------- 5) meta_cidades: primeiro as simples, depois as fusões --------
    for (const m of plano.metaSimples) {
        try {
            const r = await prisma.metaCidade.updateMany({ where: { id: m.id, cidade: m.de }, data: { cidade: m.para } });
            efeitos.metaSimples += r.count;
        } catch (e) {
            falhas.push({ tabela: 'metaCidades', id: m.id, de: m.de, para: m.para, erro: e.message });
        }
    }

    for (const m of plano.metaMerges) {
        try {
            // Transação PEQUENA e por meta: o delete da(s) perdedora(s) e o update da que
            // fica têm que valer juntos — apagar uma sem somar o valor na outra APAGA meta
            // de vendedor, e somar sem apagar violaria na prática o `@@unique` (duas linhas
            // da mesma cidade na mesma meta). Só banco aqui dentro; nada de log nem de
            // chamada externa. Timeout generoso porque o banco compartilhado é lento em pico.
            //
            // Toda escrita é GUARDADA pelo estado que o plano viu (`cidade` + `valor` +
            // `diasSemana`) e CONFERIDA pela contagem. Se alguém mexeu na meta entre o plano
            // e agora — ou se é o 2º clique de um clique duplo — a contagem não bate, o
            // `throw` derruba a transação inteira e nada é aplicado nesta meta. Antes daqui
            // o código usava `update`/`deleteMany` sem guarda e contava `efeitos` a partir do
            // PLANO: o QA pegou uma chamada relatando "4 apagadas" sem ter apagado nada.
            const r = await prisma.$transaction(async (tx) => {
                let apagadas = 0;
                for (const p of m._perdedoras) {
                    const rd = await tx.metaCidade.deleteMany({
                        where: { id: p.id, cidade: p.cidade, valor: num(p.valor), diasSemana: p.diasSemana },
                    });
                    apagadas += rd.count;
                }
                if (apagadas !== m._perdedoras.length) {
                    throw new Error(`linha(s) a apagar mudaram desde o plano (apagadas ${apagadas} de ${m._perdedoras.length}) — fusão não aplicada`);
                }
                const rv = await tx.metaCidade.updateMany({
                    where: {
                        id: m._vencedora.id,
                        cidade: m._vencedora.cidade,
                        valor: num(m._vencedora.valor),
                        diasSemana: m._vencedora.diasSemana,
                    },
                    data: {
                        cidade: m._aplicado.cidade,
                        valor: m._aplicado.valor,
                        diasSemana: m._aplicado.diasSemana,
                    },
                });
                if (rv.count !== 1) {
                    throw new Error('a linha que fica mudou desde o plano — fusão não aplicada');
                }
                return { apagadas, fundidas: rv.count };
            }, { timeout: 20000, maxWait: 10000 });
            efeitos.metaFusoes += r.fundidas;
            efeitos.metaApagadas += r.apagadas;
        } catch (e) {
            falhas.push({
                tabela: 'metaCidades(fusão)', meta: m.metaMensalVendedorId,
                nomeFinal: m.nomeFinal, erro: e.message,
            });
        }
    }

    // -------- o plano bateu com a realidade? --------
    // `efeitos` só vale como rede de segurança se alguém COMPARAR com o previsto. Qualquer
    // divergência (linha editada entre o plano e a aplicação, clique duplo, fusão recusada
    // pela guarda) vira `corridaDetectada: true` E derruba o `ok` — um relatório que afirma
    // o que não aconteceu é pior que não ter relatório.
    const divergencias = [];
    for (const chave of Object.keys(previsto.tabelas)) {
        if (efeitos.tabelas[chave] !== previsto.tabelas[chave]) {
            divergencias.push({ onde: chave, previsto: previsto.tabelas[chave], realizado: efeitos.tabelas[chave] });
        }
    }
    for (const chave of ['fornecedoresUf', 'metaSimples', 'metaFusoes', 'metaApagadas']) {
        if (efeitos[chave] !== previsto[chave]) {
            divergencias.push({ onde: chave, previsto: previsto[chave], realizado: efeitos[chave] });
        }
    }
    const corridaDetectada = divergencias.length > 0;

    // Carimba o snapshot com o resultado. FORA de qualquer transação e em try/catch próprio:
    // o banco já foi alterado, e uma falha ao escrever arquivo não pode virar erro da
    // operação — o snapshot original, que é o que permite reverter, já está gravado.
    try {
        snapshot.aplicadoEm = new Date().toISOString();
        snapshot.efeitos = efeitos;
        snapshot.previsto = previsto;
        snapshot.corridaDetectada = corridaDetectada;
        snapshot.divergencias = divergencias;
        snapshot.falhas = falhas;
        await gravarSnapshot(snapshot);
    } catch (e) {
        console.error('[backfill-cidades] falha ao carimbar o snapshot (dado JÁ alterado):', e.message);
    }

    // Confere sozinho que ficou idempotente — se sobrou mudança, algo não foi aplicado.
    const conferencia = await montarPlano({ permitirForaDoDicionario });

    return {
        ok: falhas.length === 0 && !corridaDetectada,
        aplicado: true,
        snapshot: { arquivo: nomeArquivo, caminho: caminhoSnapshot },
        efeitos,
        previsto,
        corridaDetectada,
        divergencias,
        falhas,
        // A trava do dicionário foi furada nesta execução? Ver o aviso em `montarPlano`.
        ...(permitirForaDoDicionario ? { avisoForaDoDicionario: AVISO_FORA_DO_DICIONARIO } : {}),
        conferenciaDepois: {
            aindaMudam: conferencia.resumo.totalLinhas,
            idempotente: conferencia.resumo.totalLinhas === 0,
            registrosQueMudam: conferencia.resumo.registrosQueMudam,
        },
        planoAplicado: resposta,
    };
}

// ============================================================================
// 4) REVERTER
// ============================================================================
async function reverter({ arquivo } = {}) {
    // Mesmo cadeado de `aplicar`: reverter enquanto um backfill está a meio caminho
    // desfaria linhas que ainda estão sendo escritas.
    if (_emAndamento) {
        return { ok: false, erro: `já existe um "${_emAndamento}" em andamento — espere terminar` };
    }
    _emAndamento = 'backfill-cidades-reverter';
    try {
        return await reverterDeVerdade({ arquivo });
    } finally {
        _emAndamento = null;
    }
}

async function reverterDeVerdade({ arquivo }) {
    const lista = await listarSnapshots();
    if (!lista.snapshots.length) return { ok: false, erro: `nenhum snapshot em ${DIR_SNAPSHOTS}` };

    // Sem `arquivo`, reverte o MAIS RECENTE que ainda não foi revertido.
    const alvo = arquivo
        ? lista.snapshots.find(s => s.arquivo === arquivo)
        : lista.snapshots.find(s => !s.revertidoEm);
    if (!alvo) {
        return {
            ok: false,
            erro: arquivo ? `snapshot não encontrado: ${arquivo}` : 'todos os snapshots já foram revertidos',
            disponiveis: lista.snapshots,
        };
    }

    const caminho = path.join(DIR_SNAPSHOTS, alvo.arquivo);
    const snapshot = JSON.parse(await fs.readFile(caminho, 'utf8'));
    if (snapshot.revertidoEm) {
        return { ok: false, erro: `este snapshot já foi revertido em ${snapshot.revertidoEm}`, arquivo: alvo.arquivo };
    }

    const efeitos = { tabelas: {}, fornecedoresUf: 0, metaSimples: 0, metaFusoesDesfeitas: 0, metaRecriadas: 0 };
    const pulados = [];

    // TODO bloco daqui para baixo roda dentro de try/catch PRÓPRIO. Antes só a fusão de meta
    // estava protegida: uma exceção em `metaSimples`, em `fornecedorUf` ou nas tabelas subia
    // como 500, abortava a reversão no meio e — pior — pulava o carimbo de `revertidoEm`, ou
    // seja, o relatório do que já tinha sido desfeito se perdia junto. Cada bloco agora
    // registra o próprio problema em `pulados` e a reversão segue para o próximo.

    // Ordem inversa da aplicação: meta primeiro (é onde houve DELETE), tabelas simples depois.
    for (const m of (snapshot.metaMerges || [])) {
        try {
            await prisma.$transaction(async (tx) => {
                // A linha que ficou só volta se ainda estiver EXATAMENTE como o backfill a
                // deixou — cidade, VALOR e DIAS. Se alguém editou a meta desde então,
                // desfazer por cima apagaria o trabalho dessa pessoa. `diasSemana` entrou na
                // guarda na conferência: sem ele, quem tivesse mexido SÓ nos dias de visita
                // (o campo que mais muda numa meta) tinha a edição sobrescrita em silêncio,
                // exatamente o contrário do que esta guarda promete.
                const atual = await tx.metaCidade.findUnique({ where: { id: m.vencedoraAntes.id } });
                if (!atual) throw new Error('a linha que ficou não existe mais');
                if (atual.cidade !== m.aplicado.cidade
                    || num(atual.valor) !== num(m.aplicado.valor)
                    || (atual.diasSemana || null) !== (m.aplicado.diasSemana || null)) {
                    throw new Error(`a linha que ficou foi alterada depois do backfill `
                        + `(hoje: ${atual.cidade} / ${num(atual.valor)} / ${atual.diasSemana || '-'})`);
                }
                await tx.metaCidade.update({
                    where: { id: m.vencedoraAntes.id },
                    data: {
                        cidade: m.vencedoraAntes.cidade,
                        valor: m.vencedoraAntes.valor,
                        diasSemana: m.vencedoraAntes.diasSemana,
                    },
                });
                for (const p of (m.apagadas || [])) {
                    const existe = await tx.metaCidade.findUnique({ where: { id: p.id } });
                    if (existe) continue;                    // já recriada numa reversão anterior
                    await tx.metaCidade.create({
                        data: {
                            id: p.id,
                            metaMensalVendedorId: p.metaMensalVendedorId,
                            cidade: p.cidade,
                            valor: p.valor,
                            diasSemana: p.diasSemana,
                            ...(p.createdAt ? { createdAt: new Date(p.createdAt) } : {}),
                        },
                    });
                }
            }, { timeout: 20000, maxWait: 10000 });
            efeitos.metaFusoesDesfeitas += 1;
            efeitos.metaRecriadas += (m.apagadas || []).length;
        } catch (e) {
            pulados.push({
                tabela: 'metaCidades(fusão)', meta: m.metaMensalVendedorId,
                nomeFinal: m.nomeFinal, motivo: e.message,
            });
        }
    }

    for (const m of (snapshot.metaSimples || [])) {
        try {
            const r = await prisma.metaCidade.updateMany({ where: { id: m.id, cidade: m.para }, data: { cidade: m.de } });
            efeitos.metaSimples += r.count;
            if (r.count === 0) pulados.push({ tabela: 'metaCidades', id: m.id, motivo: `não está mais em "${m.para}"` });
        } catch (e) {
            pulados.push({ tabela: 'metaCidades', id: m.id, motivo: `erro ao reverter: ${e.message}` });
        }
    }

    for (const u of (snapshot.fornecedorUf || [])) {
        try {
            const r = await prisma.fornecedor.updateMany({ where: { id: u.id, uf: u.para }, data: { uf: u.de } });
            efeitos.fornecedoresUf += r.count;
            if (r.count === 0) pulados.push({ tabela: 'fornecedores.uf', id: u.id, motivo: `não está mais em "${u.para}"` });
        } catch (e) {
            pulados.push({ tabela: 'fornecedores.uf', id: u.id, motivo: `erro ao reverter: ${e.message}` });
        }
    }

    for (const t of [...(snapshot.tabelas || [])].reverse()) {
        const alvo2 = ALVOS.find(a => a.chave === t.tabela);
        if (!alvo2) { pulados.push({ tabela: t.tabela, motivo: 'tabela desconhecida no snapshot' }); continue; }
        // Agrupa por valor ANTIGO: um `updateMany` por valor, com `id in (...)`.
        // O filtro pelo valor ATUAL (`[campo]: para`) é a trava: linha que alguém editou
        // depois do backfill não é sobrescrita — ela não casa e entra em `pulados`.
        const porDe = new Map();
        for (const l of t.linhas) {
            if (!porDe.has(l.de)) porDe.set(l.de, { para: l.para, ids: [] });
            porDe.get(l.de).ids.push(l.id);
        }
        let linhas = 0;
        for (const [de, g] of porDe.entries()) {
            try {
                const r = await prisma[alvo2.model].updateMany({
                    where: { [alvo2.pk]: { in: g.ids }, [t.campo]: g.para },
                    data: { [t.campo]: de },
                });
                linhas += r.count;
                if (r.count < g.ids.length) {
                    pulados.push({
                        tabela: t.tabela, de, para: g.para,
                        esperadas: g.ids.length, revertidas: r.count,
                        motivo: 'linhas alteradas depois do backfill',
                    });
                }
            } catch (e) {
                pulados.push({ tabela: t.tabela, de, para: g.para, motivo: `erro ao reverter: ${e.message}` });
            }
        }
        efeitos.tabelas[t.tabela] = linhas;
    }

    try {
        snapshot.revertidoEm = new Date().toISOString();
        snapshot.efeitosReversao = efeitos;
        snapshot.puladosNaReversao = pulados;
        await fs.writeFile(caminho, JSON.stringify(snapshot, null, 2), 'utf8');
    } catch (e) {
        console.error('[backfill-cidades] falha ao carimbar a reversão (dado JÁ revertido):', e.message);
    }

    return { ok: pulados.length === 0, arquivo: alvo.arquivo, efeitos, pulados };
}

module.exports = {
    DIR_SNAPSHOTS,
    ALVOS,
    AVISO_FORA_DO_DICIONARIO,
    classificarMudanca,
    montarPlano,
    planoParaResposta,
    listarSnapshots,
    aplicar,
    reverter,
};
