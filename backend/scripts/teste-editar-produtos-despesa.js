/**
 * Teste da EDIÇÃO DE PRODUTOS DE UMA DESPESA (Contas a Pagar) contra o banco LOCAL,
 * exercitando os serviços de verdade — transação, movimentações, retrato de custo,
 * replay e trava de concorrência.
 *
 * REGRA DE CUSTO (08/2026): custo = média das compras VÁLIDAS mais recentes que COBREM
 * o estoqueAtual (a que cruza o limite entra INTEIRA). Sem compra válida → custo intocado.
 *
 * Prova, no banco:
 *   1. COMPRA ÚNICA (o caso PALMITO): corrigir a quantidade acerta estoque e custo;
 *      tirar o produto devolve o estoque e o custo FICA NO ÚLTIMO VALOR (não volta ao
 *      manual antigo, não zera — não há mais compra válida para recalcular).
 *   2. NOTA FISCAL + DESPESA MANUAL MISTURADAS, com `dataCompra` FORA da ordem de
 *      criação (nota emitida em 01/08 conferida DEPOIS de uma despesa manual de hoje):
 *      o custo é a média das compras recentes que cobrem o estoque — independe da ordem
 *      do replay e de retrato; o recompute é idempotente (bate com o caminho ao vivo).
 *   3. A correção NÃO muda a compra de mês: a linha relançada mantém a `dataCompra`
 *      da linha estornada.
 *   4. Duas correções SIMULTÂNEAS na mesma despesa não somam nem perdem estoque
 *      (trava `SELECT ... FOR UPDATE` na despesa).
 *   5. Sem compra válida restante: o custo é MANTIDO e sai aviso — nunca zerado em silêncio.
 *
 * Cria e APAGA os próprios dados (prefixo TESTE-DESPESA-PROD).
 *
 * ⛔ SÓ RODA NO BANCO LOCAL — trava dura em `exigir-banco-local.js`: o script cria
 * usuário/produtos/despesas e APAGA linhas no final; num banco de produção isso mexeria
 * em estoque e custo de verdade. Se a DATABASE_URL não for local, aborta sem tocar no banco.
 *
 * Rodar: node backend/scripts/teste-editar-produtos-despesa.js
 */

require('dotenv').config();
require('./exigir-banco-local')('teste-editar-produtos-despesa.js'); // ANTES de tocar no banco
const prisma = require('../config/database');
const compraEstoqueService = require('../services/compraEstoqueService');
const notaEstoqueService = require('../services/notaEstoqueService');

const MARCA = `TESTE-DESPESA-PROD-${Date.now()}`;
const num = (v) => Number(v || 0);
const round = (v, c = 2) => Math.round(Number(v) * 10 ** c) / 10 ** c;

let falhas = 0;
const conferir = (rotulo, obtido, esperado, casas = 2) => {
    const ok = Math.abs(num(obtido) - num(esperado)) < 0.5 / 10 ** casas;
    console.log(`  ${ok ? '✅' : '❌'} ${rotulo}: ${round(obtido, casas)} (esperado ${round(esperado, casas)})`);
    if (!ok) falhas++;
};
const conferirTexto = (rotulo, obtido, esperado) => {
    const ok = String(obtido) === String(esperado);
    console.log(`  ${ok ? '✅' : '❌'} ${rotulo}: ${obtido} (esperado ${esperado})`);
    if (!ok) falhas++;
};
const dizer = (rotulo, condicao) => {
    console.log(`  ${condicao ? '✅' : '❌'} ${rotulo}`);
    if (!condicao) falhas++;
};

const criado = { produtoIds: [], contaIds: [], notaIds: [], vendedorId: null };

async function limpar() {
    for (const notaId of criado.notaIds) {
        await prisma.notaEntradaEstoqueMov.deleteMany({ where: { notaEntradaId: notaId } });
        await prisma.compraItem.deleteMany({ where: { notaEntradaId: notaId } });
        await prisma.notaEntradaItem.deleteMany({ where: { notaEntradaId: notaId } });
        await prisma.notaEntrada.deleteMany({ where: { id: notaId } });
    }
    for (const contaId of criado.contaIds) {
        await prisma.compraItem.deleteMany({ where: { contaPagarId: contaId } });
        const parcelas = await prisma.parcelaPagar.findMany({ where: { contaPagarId: contaId }, select: { id: true } });
        await prisma.pagamentoParcelaPagar.deleteMany({ where: { parcelaPagarId: { in: parcelas.map((p) => p.id) } } });
        await prisma.parcelaPagar.deleteMany({ where: { contaPagarId: contaId } });
        await prisma.contaPagar.deleteMany({ where: { id: contaId } });
    }
    for (const produtoId of criado.produtoIds) {
        await prisma.movimentacaoEstoque.deleteMany({ where: { produtoId } });
        await prisma.compraItem.deleteMany({ where: { produtoId } });
        await prisma.produto.deleteMany({ where: { id: produtoId } });
    }
    if (criado.vendedorId) await prisma.vendedor.deleteMany({ where: { id: criado.vendedorId } });
}

async function criarProduto(nome, estoque, custo) {
    const p = await prisma.produto.create({
        data: {
            contaAzulId: `${MARCA}-${nome}`,
            codigo: `${MARCA}-${nome}`.slice(0, 40),
            nome: `${nome} (teste despesa)`,
            unidade: 'KG',
            valorVenda: 99,
            controlaEstoque: true,
            estoqueTotal: estoque,
            estoqueDisponivel: estoque,
            custoManual: custo,
            ativo: false
        }
    });
    criado.produtoIds.push(p.id);
    return p;
}

async function criarDespesa(descricao, valor, extras = {}) {
    const c = await prisma.contaPagar.create({
        data: {
            descricao: `${descricao} — ${MARCA}`,
            origem: 'MANUAL',
            valorTotal: valor,
            status: 'ABERTO',
            dataEmissao: extras.dataEmissao || new Date(),
            competencia: extras.competencia || null,
            parcelas: { create: [{ numeroParcela: 1, valor, dataVencimento: new Date('2026-09-10T12:00:00Z') }] },
            ...extras.dados
        },
        include: { parcelas: true }
    });
    criado.contaIds.push(c.id);
    return c;
}

/** Roda a mesma coisa que a rota PUT /:id/itens: transação + fecha o custo depois do commit. */
async function editarProdutos(conta, itens, criadoPorId) {
    let resultado;
    await prisma.$transaction(async (tx) => {
        resultado = await compraEstoqueService.sincronizarComprasConta(tx, conta, null, itens, criadoPorId);
    }, { timeout: 20000, maxWait: 10000 });
    const fechamento = await compraEstoqueService.fecharCustoDosAlvos({
        produtoIds: resultado.alvos.produtoIds,
        itemPcpIds: resultado.alvos.itemPcpIds,
        restaurados: resultado.restaurados
    });
    return {
        ...resultado,
        custos: fechamento.custos,
        avisos: [...resultado.avisos, ...fechamento.avisos],
        infos: [...resultado.infos, ...fechamento.infos]
    };
}

async function principal() {
    const vendedor = await prisma.vendedor.create({
        data: { id: `${MARCA}-USER`, nome: 'Usuário de teste', ativo: false }
    });
    criado.vendedorId = vendedor.id;

    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n═══ 1. COMPRA ÚNICA — o caso PALMITO (quantidade errada) ═══');
    // Produto com custo digitado à mão e nenhuma compra no histórico.
    const palmito = await criarProduto('PALMITO', 40, 21);
    const despesa1 = await criarDespesa('Palmito pupunha', 950);
    console.log('  antes: 40 KG em estoque, custo R$ 21,00/KG (custo digitado à mão, sem compras)');

    // Lançamento ERRADO: 20 UN × R$ 47,50 (o que aconteceu na vida real)
    await compraEstoqueService.registrarComprasManuais(
        despesa1, null,
        [{ descricao: 'PALMITO PUPUNHA', quantidade: 20, valorTotal: 950, produtoId: palmito.id }],
        vendedor.id
    );
    // Simula que a despesa foi lançada em JULHO (linha criada lá): é o que prova depois
    // que a correção de hoje não muda a compra de mês.
    const DATA_JULHO = new Date('2026-07-20T15:00:00Z');
    await prisma.compraItem.updateMany({
        where: { contaPagarId: despesa1.id, estornado: false },
        data: { dataCompra: DATA_JULHO, criadoEm: DATA_JULHO }
    });

    const erradoP = await prisma.produto.findUnique({ where: { id: palmito.id } });
    conferir('estoque com o lançamento errado (KG)', erradoP.estoqueTotal, 60, 3);
    // Regra nova: a única compra (20 UN @ 47,50) não cobre os 60 do estoque → usa ela
    // inteira → custo 47,50 (o valor manual antigo de R$ 21 não entra).
    conferir('custo com o lançamento errado (R$/KG)', erradoP.custoManual, 47.5);

    console.log('\n  → corrigindo para 200 UN (mesmo valor de R$ 950)');
    const r1 = await editarProdutos(despesa1, [
        { produtoId: palmito.id, itemPcpId: null, descricao: 'PALMITO PUPUNHA', unidade: 'KG', quantidade: 200, valorTotal: 950 }
    ], vendedor.id);
    const certoP = await prisma.produto.findUnique({ where: { id: palmito.id } });
    conferir('estoque corrigido (KG)', certoP.estoqueTotal, 240, 3);             // 40 + 200
    // Regra nova: a compra corrigida (200 KG @ 4,75) não cobre os 240 → usa ela inteira → 4,75.
    conferir('custo corrigido (R$/KG)', certoP.custoManual, 4.75);
    conferir('linhas ativas no histórico', (await prisma.compraItem.count({ where: { contaPagarId: despesa1.id, estornado: false } })), 1, 0);
    conferir('linhas estornadas (a errada)', (await prisma.compraItem.count({ where: { contaPagarId: despesa1.id, estornado: true } })), 1, 0);

    // ── BLOQUEANTE 2: a correção NÃO pode mover a compra de mês
    const linhaNova = await prisma.compraItem.findFirst({ where: { contaPagarId: despesa1.id, estornado: false } });
    conferirTexto('dataCompra preservada (mês da compra)', new Date(linhaNova.dataCompra).toISOString().slice(0, 10), DATA_JULHO.toISOString().slice(0, 10));
    dizer('a linha relançada NÃO foi carimbada com a data de hoje',
        new Date(linhaNova.dataCompra).getMonth() === 6);
    console.log(`     (dataCompra da linha nova: ${new Date(linhaNova.dataCompra).toISOString()})`);

    console.log('\n  → agora TIRANDO o produto da despesa (lista vazia)');
    const r2 = await editarProdutos(despesa1, [], vendedor.id);
    const semP = await prisma.produto.findUnique({ where: { id: palmito.id } });
    conferir('estoque devolvido (KG)', semP.estoqueTotal, 40, 3);
    // Regra nova: sem compra válida restante, o custo NÃO é recalculado — fica no último
    // valor (4,75). Não volta ao manual antigo (21) nem zera.
    conferir('custo fica no ÚLTIMO valor (não volta a 21, não zera) (R$/KG)', semP.custoManual, 4.75);
    dizer('o custo não foi zerado nem apagado', semP.custoManual != null && num(semP.custoManual) > 0);
    console.log(`     avisos: ${r2.avisos.length ? r2.avisos.join(' | ') : '(nenhum)'}`);
    console.log(`     infos:  ${r2.infos.length ? r2.infos.join(' | ') : '(nenhuma)'}`);
    dizer('sem compra válida, avisou que não deu para recalcular (custo mantido)',
        r2.avisos.some((t) => t.includes('Não consegui recalcular') || t.includes('não sobrou compra válida')));
    dizer('avisos do passo 1 sem ruído informativo',
        !r1.avisos.some((t) => t.includes('recalculado')) && r1.infos.some((t) => t.includes('recalculado')));

    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n═══ 2. NOTA FISCAL + DESPESA MANUAL com dataCompra FORA da ordem de criação ═══');
    console.log('  (a nota é emitida em 01/08 e conferida DEPOIS da despesa manual de hoje —');
    console.log('   a regra nova ordena por dataCompra: as compras recentes que cobrem o estoque mandam)');
    const queijo = await criarProduto('QUEIJO', 40, 21);
    console.log('  antes: 40 KG @ R$ 21,00 = R$ 840,00');

    // (a) hoje: despesa manual de 100 KG por R$ 5.000 → criada PRIMEIRO, dataCompra = hoje
    const despesa2 = await criarDespesa('Compra avulsa de queijo', 5000);
    await compraEstoqueService.registrarComprasManuais(
        despesa2, null,
        [{ descricao: 'QUEIJO AVULSO', quantidade: 100, valorTotal: 5000, produtoId: queijo.id }],
        vendedor.id
    );
    const depoisManual = await prisma.produto.findUnique({ where: { id: queijo.id } });
    conferir('depois da despesa manual — estoque (KG)', depoisManual.estoqueTotal, 140, 3);
    // Regra nova: a compra (100 KG @ 50) não cobre os 140 → usa ela inteira → 50,00.
    conferir('depois da despesa manual — custo (R$/KG)', depoisManual.custoManual, 50);

    // (b) depois: nota EMITIDA EM 01/08 conferida agora — 120 KG por R$ 1.200
    const nota = await prisma.notaEntrada.create({
        data: {
            chave: `${MARCA}`.padEnd(44, '0').slice(0, 44),
            tipo: 'NFE',
            numero: '888888',
            fornecedorCnpj: '99999999000199',
            fornecedorNome: 'Fornecedor de Teste',
            emissao: new Date('2026-08-01T12:00:00Z'),
            valorTotal: 1200,
            status: 'NOVA',
            itens: { create: [{ numeroItem: 1, codigoFornecedor: 'CX-QJ', descricao: 'QUEIJO CAIXA', unidade: 'CX', quantidade: 12, valorUnitario: 100, valorTotal: 1200 }] }
        },
        include: { itens: true }
    });
    criado.notaIds.push(nota.id);
    await prisma.$transaction(async (tx) => {
        await notaEstoqueService.aplicarEstoqueNota(
            tx, nota,
            notaEstoqueService.montarItensResolvidos([{ itemNota: nota.itens[0], produtoId: queijo.id, fator: 10 }]),
            { comCusto: true, criadoPorId: vendedor.id }
        );
    }, { timeout: 20000, maxWait: 10000 });

    const depoisNota = await prisma.produto.findUnique({ where: { id: queijo.id } });
    conferir('depois da nota — estoque (KG)', depoisNota.estoqueTotal, 260, 3);
    // Regra nova: as 2 compras válidas (100 KG @ 50 hoje + 120 KG @ 10 de 01/08) somam 220 KG,
    // menos que os 260 do estoque → usa AS DUAS → (100·50 + 120·10)/220 = R$ 28,18/KG.
    conferir('depois da nota — custo (R$/KG)', depoisNota.custoManual, 28.18);
    const linhas = await prisma.compraItem.findMany({
        where: { produtoId: queijo.id, estornado: false },
        orderBy: { criadoEm: 'asc' },
        select: { descricaoFornecedor: true, dataCompra: true, criadoEm: true, quantidade: true, custoUnitario: true, estoqueAnterior: true, custoAnterior: true }
    });
    console.log('  histórico gravado (ordem de CRIAÇÃO):');
    for (const l of linhas) {
        console.log(`    · ${l.descricaoFornecedor} — dataCompra ${new Date(l.dataCompra).toISOString().slice(0, 10)}, criadoEm ${new Date(l.criadoEm).toISOString()}, ${round(l.quantidade, 0)} KG @ ${round(l.custoUnitario, 2)}, retrato (est ${round(l.estoqueAnterior, 0)}, custo ${round(l.custoAnterior, 2)})`);
    }
    dizer('as duas ordens estão MESMO trocadas (dataCompra da nota é anterior à da despesa manual)',
        new Date(linhas[1].dataCompra) < new Date(linhas[0].dataCompra));

    console.log('\n  → recompute do custo (é o que a correção de entrada e o estorno chamam)');
    const custoReplay = await compraEstoqueService.recalcularCustoPelasCompras({ produtoId: queijo.id });
    const depoisReplay = await prisma.produto.findUnique({ where: { id: queijo.id } });
    console.log(`     custo recomputado: R$ ${round(custoReplay, 4)}/KG  ·  estoque real: ${round(depoisReplay.estoqueTotal, 0)} KG`);
    // Regra nova: (100·50 + 120·10)/220 = R$ 28,18/KG — as duas compras válidas cobrem os
    // 260 KG do estoque (soma 220 < 260 → usa as duas). O custo NÃO depende mais da ORDEM
    // do replay nem de retrato: é sempre a média das compras recentes que cobrem o estoque.
    conferir('custo recomputado (R$/KG)', custoReplay, 28.18);
    conferir('custo gravado no produto (R$/KG)', depoisReplay.custoManual, 28.18);
    dizer('o recompute é idempotente: bate com o custo do caminho ao vivo',
        Math.abs(num(custoReplay) - num(depoisNota.custoManual)) <= 0.01);

    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n═══ 3. Duas correções SIMULTÂNEAS na mesma despesa (trava) ═══');
    const arroz = await criarProduto('ARROZ', 0, null);
    const despesa3 = await criarDespesa('Arroz do mês', 1000);
    await compraEstoqueService.registrarComprasManuais(
        despesa3, null,
        [{ descricao: 'ARROZ', quantidade: 100, valorTotal: 1000, produtoId: arroz.id }],
        vendedor.id
    );
    conferir('estoque inicial da despesa (KG)', (await prisma.produto.findUnique({ where: { id: arroz.id } })).estoqueTotal, 100, 3);

    const itensNovos = [{ produtoId: arroz.id, itemPcpId: null, descricao: 'ARROZ', unidade: 'KG', quantidade: 50, valorTotal: 1000 }];

    // (a) A trava PEGA MESMO? Uma transação segura a despesa por 1,5 s; a correção que
    // chega no meio tem que ESPERAR (sem a trava ela passaria reto e leria o estado velho).
    const seguraOLock = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM contas_pagar WHERE id = ${despesa3.id} FOR UPDATE`;
        await new Promise((r) => setTimeout(r, 1500));
    }, { timeout: 20000, maxWait: 10000 });
    await new Promise((r) => setTimeout(r, 250)); // deixa a 1ª pegar o lock
    const tEspera = Date.now();
    await Promise.all([seguraOLock, editarProdutos(despesa3, itensNovos, vendedor.id)]);
    const esperou = Date.now() - tEspera;
    dizer(`a correção esperou a despesa ser liberada (${esperou} ms, lock segurado por 1250 ms)`, esperou > 1100);

    // (b) Agora as duas ao mesmo tempo, sem ninguém segurando nada.
    const t0 = Date.now();
    const [a, b] = await Promise.allSettled([
        editarProdutos(despesa3, itensNovos, vendedor.id),
        editarProdutos(despesa3, itensNovos, vendedor.id)
    ]);
    console.log(`  as duas correções terminaram em ${Date.now() - t0} ms — ${a.status} / ${b.status}`);
    if (a.status === 'rejected') console.log(`     erro 1: ${a.reason?.message}`);
    if (b.status === 'rejected') console.log(`     erro 2: ${b.reason?.message}`);
    const arrozFim = await prisma.produto.findUnique({ where: { id: arroz.id } });
    const ativasFim = await prisma.compraItem.count({ where: { contaPagarId: despesa3.id, estornado: false } });
    conferir('estoque depois das DUAS correções simultâneas (KG)', arrozFim.estoqueTotal, 50, 3);
    conferir('linhas de compra ativas (uma só)', ativasFim, 1, 0);
    conferir('custo (R$/KG)', arrozFim.custoManual, 20);

    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n═══ 4. Sem compra válida restante — custo MANTIDO + aviso ═══');
    const feijao = await criarProduto('FEIJAO', 0, null);
    const despesa4 = await criarDespesa('Feijão legado', 500);
    await compraEstoqueService.registrarComprasManuais(
        despesa4, null,
        [{ descricao: 'FEIJAO', quantidade: 50, valorTotal: 500, produtoId: feijao.id }],
        vendedor.id
    );
    // Apaga o retrato (linhas antigas do banco não têm backfill). Na regra nova o retrato
    // nem é usado no cálculo — o teste segue provando que, quando NÃO sobra compra válida,
    // o custo é mantido e sai aviso (nunca zerado em silêncio).
    await prisma.compraItem.updateMany({
        where: { contaPagarId: despesa4.id, estornado: false },
        data: { estoqueAnterior: null, custoAnterior: null, custoPosterior: null }
    });
    await prisma.produto.update({ where: { id: feijao.id }, data: { custoManual: 33 } }); // custo mexido depois, à mão
    const r4 = await editarProdutos(despesa4, [], vendedor.id);
    const feijaoFim = await prisma.produto.findUnique({ where: { id: feijao.id } });
    conferir('estoque devolvido (KG)', feijaoFim.estoqueTotal, 0, 3);
    conferir('custo MANTIDO (não zerado) (R$/KG)', feijaoFim.custoManual, 33);
    dizer('saiu o aviso de que o custo não pôde ser recalculado',
        r4.avisos.some((t) => t.includes('Não consegui recalcular')));
    console.log(`     avisos: ${r4.avisos.join(' | ') || '(nenhum)'}`);
}

principal()
    .catch((e) => { console.error('\n❌ ERRO:', e.message, '\n', e.stack); falhas++; })
    .finally(async () => {
        await limpar().catch((e) => console.error('Falha ao limpar os dados de teste:', e.message));
        await prisma.$disconnect();
        console.log(falhas === 0 ? '\n✅ Todos os testes passaram (dados de teste apagados).\n' : `\n❌ ${falhas} teste(s) falharam.\n`);
        process.exit(falhas === 0 ? 0 : 1);
    });
