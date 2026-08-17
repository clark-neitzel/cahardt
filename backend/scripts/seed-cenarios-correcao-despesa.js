/**
 * Fixtures do QA para "corrigir os produtos de uma despesa" (Contas a Pagar, 08/2026).
 * Monta no banco LOCAL os cenários que não dá para criar clicando na tela, e some com
 * eles depois.
 *
 * ⛔ SÓ RODA NO BANCO LOCAL — trava dura em `exigir-banco-local.js` (não é só comentário):
 * o script cria USUÁRIOS ATIVOS com senha conhecida (qa123456), um deles com permissão de
 * baixar contas a pagar e corrigir entrada de estoque. Se a DATABASE_URL não for local,
 * o processo aborta antes de ler ou escrever qualquer coisa — inclusive no `--limpar`
 * (apagar em produção seria pior ainda que criar).
 *
 * Cenários criados (todos com o mesmo carimbo, para dar para apagar tudo de uma vez):
 *   1. QUITADA com pagamento registrado — o caso PALMITO: 20 UN × R$ 47,50 lançadas
 *      erradas (é a despesa que a correção tem que consertar sem encostar no financeiro).
 *   2. VINDA DE NOTA FISCAL — origem NFE + NotaEntrada vinculada + compra com
 *      notaEntradaId preenchido: a rota tem que RECUSAR com "corrija em Notas Recebidas".
 *   3. LEGADA — despesa manual cuja CompraItem está sem os 3 campos novos
 *      (estoqueAnterior/custoAnterior/custoPosterior = null), como as linhas antigas do
 *      banco: ao tirar o produto, o custo tem que ser MANTIDO e sair aviso, nunca zerado.
 *   4. CANCELADA — a rota tem que recusar (compras já devolvidas).
 *
 * Também cria 3 usuários para provar as travas de permissão (senha: qa123456):
 *   qa.semescrita   → só Pode_Acessar_Contas_Pagar          → 403 "alterar contas a pagar"
 *   qa.semcorrigir  → Acessar + Pode_Baixar_Contas_Pagar    → 403 "corrigir os produtos"
 *   qa.completo     → Acessar + Baixar + Corrigir_Entrada   → passa
 *
 * Rodar:   node backend/scripts/seed-cenarios-correcao-despesa.js
 * Limpar:  node backend/scripts/seed-cenarios-correcao-despesa.js --limpar
 */

require('dotenv').config();
require('./exigir-banco-local')('seed-cenarios-correcao-despesa.js'); // ANTES de tocar no banco
const bcrypt = require('bcryptjs');
const prisma = require('../config/database');
const compraEstoqueService = require('../services/compraEstoqueService');

const CARIMBO = 'QA-CORRECAO-DESPESA';
const SENHA = 'qa123456';
const USUARIOS = [
    { id: `${CARIMBO}-U1`, login: 'qa.semescrita', nome: 'QA sem escrita', permissoes: { Pode_Acessar_Contas_Pagar: true } },
    { id: `${CARIMBO}-U2`, login: 'qa.semcorrigir', nome: 'QA sem corrigir entrada', permissoes: { Pode_Acessar_Contas_Pagar: true, Pode_Baixar_Contas_Pagar: true } },
    { id: `${CARIMBO}-U3`, login: 'qa.completo', nome: 'QA completo', permissoes: { Pode_Acessar_Contas_Pagar: true, Pode_Baixar_Contas_Pagar: true, Pode_Corrigir_Entrada_Estoque: true } }
];

async function limpar() {
    const contas = await prisma.contaPagar.findMany({ where: { descricao: { contains: CARIMBO } }, select: { id: true } });
    const ids = contas.map((c) => c.id);
    const notas = await prisma.notaEntrada.findMany({ where: { numero: { startsWith: '77777' } , fornecedorNome: { contains: CARIMBO } }, select: { id: true } });
    const produtos = await prisma.produto.findMany({ where: { codigo: { startsWith: CARIMBO } }, select: { id: true } });

    for (const n of notas) {
        await prisma.notaEntradaEstoqueMov.deleteMany({ where: { notaEntradaId: n.id } });
        await prisma.compraItem.deleteMany({ where: { notaEntradaId: n.id } });
        await prisma.notaEntradaItem.deleteMany({ where: { notaEntradaId: n.id } });
    }
    await prisma.contaPagar.updateMany({ where: { id: { in: ids } }, data: { statusEnvioCA: 'NAO_ENVIAR' } });
    await prisma.notaEntrada.updateMany({ where: { id: { in: notas.map((n) => n.id) } }, data: { contaPagarId: null } });
    await prisma.compraItem.deleteMany({ where: { contaPagarId: { in: ids } } });
    const parcelas = await prisma.parcelaPagar.findMany({ where: { contaPagarId: { in: ids } }, select: { id: true } });
    await prisma.pagamentoParcelaPagar.deleteMany({ where: { parcelaPagarId: { in: parcelas.map((p) => p.id) } } });
    await prisma.parcelaPagar.deleteMany({ where: { contaPagarId: { in: ids } } });
    await prisma.contaPagar.deleteMany({ where: { id: { in: ids } } });
    await prisma.notaEntrada.deleteMany({ where: { id: { in: notas.map((n) => n.id) } } });
    for (const p of produtos) {
        await prisma.movimentacaoEstoque.deleteMany({ where: { produtoId: p.id } });
        await prisma.compraItem.deleteMany({ where: { produtoId: p.id } });
    }
    await prisma.produto.deleteMany({ where: { id: { in: produtos.map((p) => p.id) } } });
    const usuarios = await prisma.vendedor.deleteMany({ where: { id: { in: USUARIOS.map((u) => u.id) } } });
    console.log(`🧹 Limpo: ${ids.length} despesa(s), ${notas.length} nota(s), ${produtos.length} produto(s), ${usuarios.count} usuário(s).`);
}

async function produto(sufixo, nome, estoque, custo) {
    return prisma.produto.create({
        data: {
            contaAzulId: `${CARIMBO}-${sufixo}`,
            codigo: `${CARIMBO}-${sufixo}`,
            nome: `${nome} [QA]`,
            unidade: 'UN',
            valorVenda: 99,
            controlaEstoque: true,
            estoqueTotal: estoque,
            estoqueDisponivel: estoque,
            custoManual: custo
        }
    });
}

async function principal() {
    if (process.argv.includes('--limpar')) return limpar();
    await limpar(); // recomeça do zero a cada execução

    // ── Usuários das travas de permissão ──
    const senhaHash = await bcrypt.hash(SENHA, 10);
    for (const u of USUARIOS) {
        await prisma.vendedor.create({
            data: { id: u.id, nome: `${u.nome} (${CARIMBO})`, login: u.login, senha: senhaHash, permissoes: u.permissoes, ativo: true }
        });
    }
    const autor = USUARIOS[2].id;

    // ── 1. Despesa QUITADA com pagamento — o caso PALMITO ──
    const palmito = await produto('PALMITO', 'Palmito pupunha', 40, 21);
    const c1 = await prisma.contaPagar.create({
        data: {
            descricao: `Palmito pupunha (quitada) — ${CARIMBO}`,
            origem: 'MANUAL',
            valorTotal: 950,
            status: 'QUITADO',
            dataEmissao: new Date('2026-07-20T12:00:00Z'),
            competencia: new Date('2026-07-01T12:00:00Z'),
            parcelas: { create: [{ numeroParcela: 1, valor: 950, dataVencimento: new Date('2026-08-05T12:00:00Z'), status: 'PAGO' }] }
        },
        include: { parcelas: true }
    });
    await prisma.pagamentoParcelaPagar.create({
        data: { parcelaPagarId: c1.parcelas[0].id, valorPago: 950, dataPagamento: new Date('2026-08-05T12:00:00Z'), origem: 'MANUAL' }
    });
    await compraEstoqueService.registrarComprasManuais(
        c1, null, [{ descricao: 'PALMITO PUPUNHA', quantidade: 20, valorTotal: 950, produtoId: palmito.id }], autor
    );
    // A compra é de JULHO (é o que prova que corrigir hoje não muda a compra de mês)
    await prisma.compraItem.updateMany({
        where: { contaPagarId: c1.id },
        data: { dataCompra: new Date('2026-07-20T12:00:00Z'), criadoEm: new Date('2026-07-20T12:00:00Z') }
    });

    // ── 2. Despesa VINDA DE NOTA FISCAL (a rota tem que recusar) ──
    const queijo = await produto('QUEIJO', 'Queijo mussarela', 0, null);
    const c2 = await prisma.contaPagar.create({
        data: {
            descricao: `NF-e 777771 mussarela — ${CARIMBO}`,
            origem: 'NFE',
            valorTotal: 2400,
            status: 'ABERTO',
            dataEmissao: new Date('2026-08-01T12:00:00Z'),
            parcelas: { create: [{ numeroParcela: 1, valor: 2400, dataVencimento: new Date('2026-09-01T12:00:00Z') }] }
        }
    });
    const nota = await prisma.notaEntrada.create({
        data: {
            chave: `${CARIMBO}-NF`.padEnd(44, '7').slice(0, 44),
            tipo: 'NFE',
            numero: '777771',
            fornecedorCnpj: '99999999000199',
            fornecedorNome: `Fornecedor ${CARIMBO}`,
            emissao: new Date('2026-08-01T12:00:00Z'),
            valorTotal: 2400,
            status: 'CONFERIDA',
            contaPagarId: c2.id,
            itens: { create: [{ numeroItem: 1, codigoFornecedor: 'CX-MUSSA', descricao: 'MUSSARELA CAIXA 10KG', unidade: 'CX', quantidade: 12, valorUnitario: 200, valorTotal: 2400 }] }
        }
    });
    await compraEstoqueService.registrarEntradasCompra(
        nota, c2.id,
        [{ itemNota: (await prisma.notaEntradaItem.findFirst({ where: { notaEntradaId: nota.id } })), produtoId: queijo.id, fator: 10 }],
        autor
    );

    // ── 3. Despesa com CompraItem LEGADA (sem o retrato antes/depois) ──
    const feijao = await produto('FEIJAO', 'Feijão carioca', 0, null);
    const c3 = await prisma.contaPagar.create({
        data: {
            descricao: `Feijão (compra legada, sem retrato) — ${CARIMBO}`,
            origem: 'MANUAL',
            valorTotal: 500,
            status: 'ABERTO',
            dataEmissao: new Date('2026-06-10T12:00:00Z'),
            parcelas: { create: [{ numeroParcela: 1, valor: 500, dataVencimento: new Date('2026-07-10T12:00:00Z') }] }
        }
    });
    await compraEstoqueService.registrarComprasManuais(
        c3, null, [{ descricao: 'FEIJAO CARIOCA', quantidade: 50, valorTotal: 500, produtoId: feijao.id }], autor
    );
    await prisma.compraItem.updateMany({
        where: { contaPagarId: c3.id },
        data: { estoqueAnterior: null, custoAnterior: null, custoPosterior: null, dataCompra: new Date('2026-06-10T12:00:00Z'), criadoEm: new Date('2026-06-10T12:00:00Z') }
    });
    await prisma.produto.update({ where: { id: feijao.id }, data: { custoManual: 12.5 } }); // custo digitado à mão depois

    // ── 4. Despesa CANCELADA ──
    const c4 = await prisma.contaPagar.create({
        data: {
            descricao: `Despesa cancelada — ${CARIMBO}`,
            origem: 'MANUAL',
            valorTotal: 100,
            status: 'CANCELADO',
            parcelas: { create: [{ numeroParcela: 1, valor: 100, dataVencimento: new Date('2026-09-01T12:00:00Z'), status: 'CANCELADO' }] }
        }
    });

    console.log(`\n✅ Cenários criados (carimbo "${CARIMBO}"). Apague com --limpar.\n`);
    console.log('Despesas:');
    console.log(`  1. QUITADA com pagamento (caso PALMITO)   id=${c1.id}`);
    console.log(`     produto=${palmito.id} (${palmito.nome}) — 40 UN a R$ 21,00 antes; a despesa lançou 20 UN × R$ 47,50`);
    console.log(`     compra de JULHO/2026: corrigir hoje NÃO pode jogar a compra para agosto`);
    console.log(`  2. VINDA DE NOTA FISCAL (deve RECUSAR)    id=${c2.id}  (nota=${nota.id})`);
    console.log(`  3. COMPRA LEGADA sem retrato              id=${c3.id}`);
    console.log(`     produto=${feijao.id} — custo à mão R$ 12,50: ao esvaziar, tem que MANTER + avisar`);
    console.log(`  4. CANCELADA (deve RECUSAR)               id=${c4.id}`);
    console.log('\nUsuários (senha qa123456):');
    for (const u of USUARIOS) console.log(`  ${u.login.padEnd(16)} → ${Object.keys(u.permissoes).join(', ')}`);
    console.log('');
}

principal()
    .catch((e) => { console.error('❌ ERRO:', e.message, '\n', e.stack); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
