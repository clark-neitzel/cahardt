/**
 * Seed PCP - Dados iniciais para o módulo de PCP
 * Uso: node scripts/seed-pcp.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Iniciando seed PCP...\n');

    // ── Matérias-Primas ──
    const mps = [
        { codigo: 'MP-001', nome: 'Frango desfiado', tipo: 'MP', unidade: 'KG', estoqueMinimo: 20 },
        { codigo: 'MP-002', nome: 'Tempero completo', tipo: 'MP', unidade: 'KG', estoqueMinimo: 5 },
        { codigo: 'MP-003', nome: 'Óleo de soja', tipo: 'MP', unidade: 'L', estoqueMinimo: 10 },
        { codigo: 'MP-004', nome: 'Aipim (mandioca)', tipo: 'MP', unidade: 'KG', estoqueMinimo: 30 },
        { codigo: 'MP-005', nome: 'Farinha de trigo', tipo: 'MP', unidade: 'KG', estoqueMinimo: 15 },
        { codigo: 'MP-006', nome: 'Sal refinado', tipo: 'MP', unidade: 'KG', estoqueMinimo: 5 },
        { codigo: 'MP-007', nome: 'Cebola', tipo: 'MP', unidade: 'KG', estoqueMinimo: 10 },
        { codigo: 'MP-008', nome: 'Alho', tipo: 'MP', unidade: 'KG', estoqueMinimo: 3 },
    ];

    // ── Embalagens ──
    const embs = [
        { codigo: 'EMB-001', nome: 'Etiqueta coxinha c/20', tipo: 'EMB', unidade: 'UN', estoqueMinimo: 500 },
        { codigo: 'EMB-002', nome: 'Saco plástico c/20', tipo: 'EMB', unidade: 'UN', estoqueMinimo: 500 },
    ];

    // ── Subprodutos ──
    const subs = [
        { codigo: 'SUB-001', nome: 'Recheio de frango', tipo: 'SUB', unidade: 'KG', estoqueMinimo: 10 },
        { codigo: 'SUB-002', nome: 'Massa cozida coxinha', tipo: 'SUB', unidade: 'KG', estoqueMinimo: 15 },
    ];

    // ── Produto Acabado ──
    const pas = [
        { codigo: 'PA-001', nome: '1-G-COXINHA AIPIM FRANGO C/20 130GR', tipo: 'PA', unidade: 'UN', estoqueMinimo: 50 },
    ];

    const todosItens = [...mps, ...embs, ...subs, ...pas];
    const itensMap = {};

    for (const item of todosItens) {
        const created = await prisma.itemPcp.upsert({
            where: { codigo: item.codigo },
            update: { nome: item.nome, tipo: item.tipo, unidade: item.unidade, estoqueMinimo: item.estoqueMinimo },
            create: { ...item, estoqueAtual: 0 },
        });
        itensMap[item.codigo] = created.id;
        console.log(`  Item: ${item.codigo} - ${item.nome} [${created.id}]`);
    }

    // ── Receita: Recheio de frango (SUB-001) ──
    // Rendimento base: 10 kg
    const receitaRecheio = await prisma.receita.upsert({
        where: { itemPcpId_versao: { itemPcpId: itensMap['SUB-001'], versao: 1 } },
        update: {},
        create: {
            itemPcpId: itensMap['SUB-001'],
            versao: 1,
            nome: 'Recheio de frango v1',
            rendimentoBase: 10.0,
            status: 'ativa',
            dataInicioVigencia: new Date(),
            itens: {
                create: [
                    { itemPcpId: itensMap['MP-001'], quantidade: 6.0, tipo: 'MP', ordemEtapa: 'preparo' },
                    { itemPcpId: itensMap['MP-002'], quantidade: 0.5, tipo: 'MP', ordemEtapa: 'preparo' },
                    { itemPcpId: itensMap['MP-003'], quantidade: 1.0, tipo: 'MP', ordemEtapa: 'preparo' },
                    { itemPcpId: itensMap['MP-007'], quantidade: 1.5, tipo: 'MP', ordemEtapa: 'preparo' },
                    { itemPcpId: itensMap['MP-008'], quantidade: 0.3, tipo: 'MP', ordemEtapa: 'preparo' },
                    { itemPcpId: itensMap['MP-006'], quantidade: 0.2, tipo: 'MP', ordemEtapa: 'preparo' },
                ],
            },
        },
    });
    console.log(`\n  Receita: ${receitaRecheio.nome} [${receitaRecheio.id}]`);

    // ── Receita: Massa cozida coxinha (SUB-002) ──
    // Rendimento base: 15 kg
    const receitaMassa = await prisma.receita.upsert({
        where: { itemPcpId_versao: { itemPcpId: itensMap['SUB-002'], versao: 1 } },
        update: {},
        create: {
            itemPcpId: itensMap['SUB-002'],
            versao: 1,
            nome: 'Massa cozida coxinha v1',
            rendimentoBase: 15.0,
            status: 'ativa',
            dataInicioVigencia: new Date(),
            itens: {
                create: [
                    { itemPcpId: itensMap['MP-004'], quantidade: 10.0, tipo: 'MP', ordemEtapa: 'cozimento' },
                    { itemPcpId: itensMap['MP-005'], quantidade: 3.0, tipo: 'MP', ordemEtapa: 'cozimento' },
                    { itemPcpId: itensMap['MP-006'], quantidade: 0.3, tipo: 'MP', ordemEtapa: 'cozimento' },
                    { itemPcpId: itensMap['MP-003'], quantidade: 0.5, tipo: 'MP', ordemEtapa: 'cozimento' },
                ],
            },
        },
    });
    console.log(`  Receita: ${receitaMassa.nome} [${receitaMassa.id}]`);

    // ── Receita: Coxinha PA (PA-001) ──
    // Rendimento base: 20 unidades (1 pacote c/20)
    const receitaCoxinha = await prisma.receita.upsert({
        where: { itemPcpId_versao: { itemPcpId: itensMap['PA-001'], versao: 1 } },
        update: {},
        create: {
            itemPcpId: itensMap['PA-001'],
            versao: 1,
            nome: 'Coxinha Aipim Frango c/20 v1',
            rendimentoBase: 20.0,
            status: 'ativa',
            dataInicioVigencia: new Date(),
            observacoes: 'Receita base: 20 unidades de 130g = 1 pacote',
            itens: {
                create: [
                    { itemPcpId: itensMap['SUB-002'], quantidade: 1.56, tipo: 'SUB', ordemEtapa: 'modelagem', observacao: '20 x 78g massa cada' },
                    { itemPcpId: itensMap['SUB-001'], quantidade: 1.04, tipo: 'SUB', ordemEtapa: 'modelagem', observacao: '20 x 52g recheio cada' },
                    { itemPcpId: itensMap['EMB-001'], quantidade: 1.0, tipo: 'EMB', ordemEtapa: 'embalagem' },
                    { itemPcpId: itensMap['EMB-002'], quantidade: 1.0, tipo: 'EMB', ordemEtapa: 'embalagem' },
                ],
            },
        },
    });
    console.log(`  Receita: ${receitaCoxinha.nome} [${receitaCoxinha.id}]`);

    console.log('\nSeed PCP concluído com sucesso!');
}

main()
    .catch(e => { console.error('Erro no seed PCP:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
