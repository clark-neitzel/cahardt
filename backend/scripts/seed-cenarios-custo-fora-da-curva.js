/**
 * Fixtures do QA para a trava de "custo fora da curva" (Notas Recebidas e Contas a Pagar, 10/2026).
 * SÓ RODA NO BANCO LOCAL (trava em exigir-banco-local.js — vale também para --limpar).
 *
 * Cria: usuários qa.custo (admin) e qa.semacesso (sem permissão nenhuma), senha qa123456;
 * produtos [QA] com histórico de compras; 4 notas NOVA:
 *   N1 (88800001) 5 itens: APRESUNTADO 2 CX R$248,17 (CUSTO_ALTO + EMBALAGEM) · AGUA 10 FD (EMBALAGEM)
 *       · CEBOLINHA 8215 KG R$120 (CUSTO_BAIXO) · CARNE MOIDA 20 KG R$2.550 (CUSTO_ALTO) · QUEIJO normal
 *   N2 (88800002) 1 item APRESUNTADO 2 CX (registrar-entrada / corrigir-entrada)
 *   N3 (88800003) nota NORMAL (sem alerta): APRESUNTADO 10 KG R$ 95 (9,50/kg)
 *   N4 (88800004) item com produto SEM histórico e SEM custo (sem alerta) + produto só com custo de cadastro
 *
 * Rodar:   node backend/scripts/seed-cenarios-custo-fora-da-curva.js   (imprime ids e login)
 * Limpar:  node backend/scripts/seed-cenarios-custo-fora-da-curva.js --limpar
 */
require('dotenv').config();
require('./exigir-banco-local')('seed-cenarios-custo-fora-da-curva.js');
const bcrypt = require('bcryptjs');
const prisma = require('../config/database');

const C = 'QA-CUSTO';
const CNPJ = '99999999000188';
const USUARIOS = [
    { id: `${C}-U1`, login: 'qa.custo', nome: 'QA custo admin', permissoes: { admin: true } },
    { id: `${C}-U2`, login: 'qa.semacesso', nome: 'QA sem acesso', permissoes: {} }
];

async function limpar() {
    const notas = await prisma.notaEntrada.findMany({ where: { fornecedorNome: { contains: C } }, select: { id: true, contaPagarId: true } });
    const nIds = notas.map((n) => n.id);
    const contas = await prisma.contaPagar.findMany({ where: { OR: [{ descricao: { contains: C } }, { id: { in: notas.map((n) => n.contaPagarId).filter(Boolean) } }] }, select: { id: true } });
    const cIds = contas.map((c) => c.id);
    const produtos = await prisma.produto.findMany({ where: { codigo: { startsWith: C } }, select: { id: true } });
    const pIds = produtos.map((p) => p.id);

    await prisma.notaEntradaEstoqueMov.deleteMany({ where: { notaEntradaId: { in: nIds } } });
    await prisma.compraItem.deleteMany({ where: { OR: [{ notaEntradaId: { in: nIds } }, { contaPagarId: { in: cIds } }, { produtoId: { in: pIds } }] } });
    await prisma.fornecedorProdutoVinculo.deleteMany({ where: { fornecedorCnpj: CNPJ } });
    await prisma.notaEntradaItem.deleteMany({ where: { notaEntradaId: { in: nIds } } });
    await prisma.notaEntrada.updateMany({ where: { id: { in: nIds } }, data: { contaPagarId: null } });
    const parcelas = await prisma.parcelaPagar.findMany({ where: { contaPagarId: { in: cIds } }, select: { id: true } });
    await prisma.pagamentoParcelaPagar.deleteMany({ where: { parcelaPagarId: { in: parcelas.map((p) => p.id) } } });
    await prisma.parcelaPagar.deleteMany({ where: { contaPagarId: { in: cIds } } });
    await prisma.contaPagar.deleteMany({ where: { id: { in: cIds } } });
    await prisma.notaEntrada.deleteMany({ where: { id: { in: nIds } } });
    await prisma.movimentacaoEstoque.deleteMany({ where: { produtoId: { in: pIds } } });
    await prisma.produto.deleteMany({ where: { id: { in: pIds } } });
    await prisma.fornecedor.deleteMany({ where: { cnpjCpf: CNPJ } });
    const u = await prisma.vendedor.deleteMany({ where: { id: { in: USUARIOS.map((x) => x.id) } } });
    console.log(`Limpo: ${nIds.length} nota(s), ${cIds.length} despesa(s), ${pIds.length} produto(s), ${u.count} usuario(s).`);
}

async function produto(suf, nome, unidade, custoManual) {
    return prisma.produto.create({
        data: { contaAzulId: `${C}-${suf}`, codigo: `${C}-${suf}`, nome: `${nome} [QA]`, unidade, valorVenda: 99, controlaEstoque: true, estoqueTotal: 100, estoqueDisponivel: 100, custoManual }
    });
}

// 5 compras anteriores (últimos 60 dias) ao redor do custo `base`
async function historico(prod, base, unidade) {
    for (let i = 0; i < 5; i++) {
        const custo = Math.round(base * (1 + (i - 2) * 0.02) * 100) / 100;
        await prisma.compraItem.create({
            data: {
                produtoId: prod.id, fornecedorNome: `Fornecedor antigo ${C}`, dataCompra: new Date(Date.now() - (10 + i * 10) * 86400000),
                descricaoFornecedor: prod.nome, quantidadeFornecedor: 10, unidadeFornecedor: unidade, fatorConversao: 1,
                quantidade: 10, unidade, valorTotal: custo * 10, custoUnitario: custo
            }
        });
    }
}

async function nota(numero, itens) {
    const total = Math.round(itens.reduce((s, i) => s + i.valorTotal, 0) * 100) / 100;
    return prisma.notaEntrada.create({
        data: {
            chave: `${C}-${numero}`.padEnd(44, '8').slice(0, 44), tipo: 'NFE', numero, fornecedorCnpj: CNPJ,
            fornecedorNome: `Fornecedor ${C}`, emissao: new Date(), valorTotal: total, status: 'NOVA',
            itens: { create: itens.map((i, k) => ({ numeroItem: k + 1, codigoFornecedor: i.cod, descricao: i.desc, unidade: i.un, quantidade: i.q, valorUnitario: i.valorTotal / i.q, valorTotal: i.valorTotal })) }
        },
        include: { itens: { orderBy: { numeroItem: 'asc' } } }
    });
}

async function principal() {
    if (process.argv.includes('--limpar')) return limpar();
    await limpar();
    const hash = await bcrypt.hash('qa123456', 10);
    for (const u of USUARIOS) await prisma.vendedor.create({ data: { id: u.id, nome: `${u.nome} (${C})`, login: u.login, senha: hash, permissoes: u.permissoes, ativo: true } });

    const apres = await produto('APRES', 'APRESUNTADO', 'KG', 9.52);
    const agua = await produto('AGUA', 'AGUA MINERAL', 'UN', 3);
    const ceb = await produto('CEB', 'CEBOLINHA', 'KG', 12);
    const carne = await produto('CARNE', 'CARNE MOIDA', 'KG', 20);
    const queijo = await produto('QUEIJO', 'QUEIJO MUSSARELA', 'KG', 30);
    const semRef = await produto('SEMREF', 'PRODUTO SEM REFERENCIA', 'KG', null);
    const soCad = await produto('SOCAD', 'PRODUTO SO CADASTRO', 'KG', 10);
    await historico(apres, 9.52, 'KG');
    await historico(ceb, 12, 'KG');
    await historico(carne, 20, 'KG');
    await historico(queijo, 30, 'KG');
    await historico(agua, 3, 'UN');

    const n1 = await nota('88800001', [
        { cod: 'A1', desc: 'APRESUNTADO CX', un: 'CX', q: 2, valorTotal: 248.17 },
        { cod: 'A2', desc: 'AGUA MINERAL FARDO', un: 'FD', q: 10, valorTotal: 30 },
        { cod: 'A3', desc: 'CEBOLINHA', un: 'KG', q: 8215, valorTotal: 120 },
        { cod: 'A4', desc: 'CARNE MOIDA', un: 'KG', q: 20, valorTotal: 2550 },
        { cod: 'A5', desc: 'QUEIJO MUSSARELA', un: 'KG', q: 10, valorTotal: 300 }
    ]);
    const n2 = await nota('88800002', [{ cod: 'B1', desc: 'APRESUNTADO CX', un: 'CX', q: 2, valorTotal: 248.17 }]);
    const n3 = await nota('88800003', [{ cod: 'C1', desc: 'APRESUNTADO', un: 'KG', q: 10, valorTotal: 95 }]);
    const n4 = await nota('88800004', [
        { cod: 'D1', desc: 'SEM REFERENCIA', un: 'KG', q: 5, valorTotal: 5000 },
        { cod: 'D2', desc: 'SO CADASTRO', un: 'KG', q: 1, valorTotal: 100 }
    ]);

    const itens = (n, ...ids) => n.itens.map((it, k) => `${it.id} -> ${ids[k]}`).join('\n      ');
    console.log(`\nCenarios criados (carimbo ${C}). Login: qa.custo / qa123456 (admin) · qa.semacesso / qa123456 (403)\n`);
    console.log(`N1 ${n1.id}\n      ${itens(n1, `PROD:${apres.id}`, `PROD:${agua.id}`, `PROD:${ceb.id}`, `PROD:${carne.id}`, `PROD:${queijo.id}`)}`);
    console.log(`N2 ${n2.id}\n      ${itens(n2, `PROD:${apres.id}`)}`);
    console.log(`N3 ${n3.id}\n      ${itens(n3, `PROD:${apres.id}`)}`);
    console.log(`N4 ${n4.id}\n      ${itens(n4, `PROD:${semRef.id}`, `PROD:${soCad.id}`)}`);
    console.log(`Produtos: apres=${apres.id} agua=${agua.id} ceb=${ceb.id} carne=${carne.id} queijo=${queijo.id} semRef=${semRef.id} soCad=${soCad.id}`);
}

principal().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
