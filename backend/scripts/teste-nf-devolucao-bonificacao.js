/**
 * Teste local da NF-e de DEVOLUÇÃO de BONIFICAÇÃO (banco hardt_local). Só escreve em
 * registros de teste (marca TESTE-NFDEVBONIF) e os apaga no começo de cada execução.
 *
 * Uso: cd backend && node scripts/teste-nf-devolucao-bonificacao.js
 *      cd backend && node scripts/teste-nf-devolucao-bonificacao.js --gerar-fixture
 *
 * `--gerar-fixture` grava scripts/fixtures/nf-devolucao-venda-antes.json com o payload que
 * `emitirDevolucao` manda à Focus para um pedido NORMAL. Foi gerado ANTES da mudança do
 * despacho de bonificação (09/2026) e é a prova de regressão do cenário (f): o caminho da
 * devolução de VENDA tem que produzir byte a byte o mesmo JSON de antes.
 *
 * A Focus é SIMULADA (`focusNfe.emitir` substituído): a SEFAZ NÃO é exercitada aqui.
 */
require('dotenv').config();
const URL_BANCO = process.env.DATABASE_URL || '';
if (!URL_BANCO.includes('hardt_local')) {
    console.error('⛔ ABORTADO: só roda no banco LOCAL hardt_local.');
    process.exit(1);
}
process.env.FOCUS_NFE_AMBIENTE = 'homologacao';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const prisma = require('../config/database');
const emissao = require('../services/focusNfeEmissaoService');
const devolucaoService = require('../services/devolucaoService');
const pedidoService = require('../services/pedidoService');
const focusNfe = require('../services/focusNfeService');

const GERAR_FIXTURE = process.argv.includes('--gerar-fixture');
const FIXTURE = path.join(__dirname, 'fixtures', 'nf-devolucao-venda-antes.json');
const MARCA = 'TESTE-NFDEVBONIF';
const NUMERO_VENDA_FIXTURE = 9890001; // nº fixo: entra na infoAdic ("Referente ao pedido #N")
const ok = (m) => console.log('  ✓ ' + m);
const info = (m) => console.log('  · ' + m);

function checar(cond, msg) {
    if (!cond) { console.error('  ✗ FALHOU: ' + msg); process.exitCode = 1; }
    else ok(msg);
}

async function limpar() {
    const pedidos = await prisma.pedido.findMany({ where: { observacoes: { startsWith: MARCA } }, select: { id: true } });
    const ids = pedidos.map(p => p.id);
    if (ids.length) {
        const devs = await prisma.devolucao.findMany({ where: { pedidoOriginalId: { in: ids } }, select: { id: true } });
        await prisma.devolucaoItem.deleteMany({ where: { devolucaoId: { in: devs.map(d => d.id) } } });
        await prisma.devolucao.deleteMany({ where: { pedidoOriginalId: { in: ids } } });
        await prisma.notaFiscalApp.deleteMany({ where: { pedidoId: { in: ids } } });
        await prisma.movimentacaoEstoque.deleteMany({ where: { pedidoId: { in: ids } } });
        await prisma.pedidoItem.deleteMany({ where: { pedidoId: { in: ids } } });
        await prisma.contaReceber.deleteMany({ where: { pedidoId: { in: ids } } });
        await prisma.pedido.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.cliente.deleteMany({ where: { Nome: { startsWith: MARCA } } });
}

async function criarCliente({ nome, doc, uf, cidade }) {
    return prisma.cliente.create({
        data: {
            UUID: crypto.randomUUID(),
            Nome: `${MARCA} ${nome}`,
            Documento: doc,
            End_Logradouro: 'RUA DE TESTE',
            End_Numero: '100',
            End_Bairro: 'CENTRO',
            End_Cidade: cidade,
            End_Estado: uf,
            End_CEP: '89200000',
            Ativo: true,
        },
    });
}

// Pedido já ENTREGUE como DEVOLVIDO (é o estado que o Caixa exige para registrar devolução),
// aprovado/faturado, com os itens informados. Direto no Prisma para fixar o `numero`.
async function criarPedido({ cliente, vendedor, bonificacao, numero, itens, extra = {} }) {
    return prisma.pedido.create({
        data: {
            clienteId: cliente.UUID,
            vendedorId: vendedor.id,
            dataVenda: new Date('2026-09-01T12:00:00.000Z'),
            dataEntrega: new Date('2026-09-02T12:00:00.000Z'),
            observacoes: `${MARCA} ${bonificacao ? 'BN' : 'VENDA'} ${numero}`,
            bonificacao,
            nfBonificacao: bonificacao,
            numero,
            statusEnvio: 'RECEBIDO',
            situacaoCA: 'FATURADO',
            statusEntrega: 'DEVOLVIDO',
            tipoPagamento: 'DINHEIRO',
            nomeCondicaoPagamento: bonificacao ? 'Bonificação' : 'À vista',
            itens: { create: itens.map(i => ({ produtoId: i.produto.id, quantidade: i.quantidade, valor: i.valor, valorBase: i.valor })) },
            ...extra,
        },
        include: { cliente: { include: { fiscal: true } }, itens: { include: { produto: true } } },
    });
}

const carregarPedido = (id) => prisma.pedido.findUnique({ where: { id }, include: { cliente: { include: { fiscal: true } }, itens: { include: { produto: true } } } });

// NotaFiscalApp da nota ORIGINAL (venda ou bonificação) já AUTORIZADA em homologação,
// com o payload real do montador (é dele que a devolução lê os itens/nItem).
async function inserirNotaOriginal({ pedido, tipo, numero, chave, status = 'AUTORIZADO' }) {
    const payload = tipo === 'BONIFICACAO'
        ? await emissao.montarNotaBonificacao(pedido)
        : await emissao.montarNotaVenda(pedido);
    return prisma.notaFiscalApp.create({
        data: {
            ref: `nf-h-${pedido.id}`, ambiente: 'homologacao', tipo, pedidoId: pedido.id,
            status, numero, serie: 1, chave, payloadEnviado: payload,
            criadoEm: new Date('2026-09-01T15:30:00.000Z'),
        },
    });
}

// Focus SIMULADA: captura o payload e devolve "autorizado".
let capturado = null;
const emitirOriginal = focusNfe.emitir;
function mockFocus(resposta) {
    capturado = null;
    focusNfe.emitir = async (ref, payload) => {
        capturado = { ref, payload: JSON.parse(JSON.stringify(payload)) };
        return resposta || { httpStatus: 200, data: { status: 'autorizado', numero: '900555', serie: '1', chave_nfe: '7'.repeat(44) } };
    };
}

// Só as datas de emissão mudam a cada execução — o resto tem que ser idêntico.
function semDatas(payload) {
    const p = JSON.parse(JSON.stringify(payload));
    delete p.data_emissao;
    delete p.data_entrada_saida;
    return p;
}

(async () => {
    await limpar();

    // Produtos de categoria que CONTROLA estoque — senão o cenário (g) não tem movimento
    // para conferir (produto.controlaEstoque null segue a regra da categoria).
    const catsControlam = (await prisma.categoriaEstoque.findMany({ where: { controlaEstoque: true }, select: { nome: true } })).map(c => c.nome);
    const produtos = await prisma.produto.findMany({
        where: { ativo: true, codigo: { not: '' }, OR: [{ controlaEstoque: true }, { controlaEstoque: null, categoria: { in: catsControlam } }] },
        orderBy: { codigo: 'asc' }, take: 2,
        select: { id: true, nome: true, codigo: true, ncm: true, unidade: true, nfeRevenda: true, nfeCest: true, estoqueTotal: true, controlaEstoque: true },
    });
    if (produtos.length < 2) throw new Error('Preciso de 2 produtos ativos com código no banco local.');
    const [prodA, prodB] = produtos;
    const vendedor = await prisma.vendedor.findFirst({ where: { login: 'Clarkson' }, select: { id: true, nome: true } });
    info(`produtos: ${prodA.codigo} ${prodA.nome} | ${prodB.codigo} ${prodB.nome} | vendedor: ${vendedor.nome}`);

    const cliSC = await criarCliente({ nome: 'PADARIA SC', doc: '98765432000110', uf: 'SC', cidade: 'Joinville' });
    const cliPR = await criarCliente({ nome: 'MERCADO PR', doc: '45111222000133', uf: 'PR', cidade: 'Curitiba' });
    const cliCPF = await criarCliente({ nome: 'JOAO CPF', doc: '12345678909', uf: 'SC', cidade: 'Joinville' });

    const itensPadrao = [{ produto: prodA, quantidade: 5, valor: 10 }, { produto: prodB, quantidade: 3, valor: 20.5 }];

    // ════════════════════════════════════════════════════════════════════════
    // (f) REGRESSÃO — devolução de pedido NORMAL: payload byte a byte igual ao de antes
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── (f) Regressão: devolução de VENDA (pedido normal) ──');
    const pedVenda = await criarPedido({ cliente: cliSC, vendedor, bonificacao: false, numero: NUMERO_VENDA_FIXTURE, itens: itensPadrao });
    await inserirNotaOriginal({ pedido: pedVenda, tipo: 'VENDA', numero: 880001, chave: '1'.repeat(44) });
    const devVenda = await devolucaoService.criarContaAzul({
        pedidoId: pedVenda.id, motivo: `${MARCA} regressao`, registradoPorId: vendedor.id,
        itens: [{ produtoId: prodB.id, quantidade: 2 }],
    });
    mockFocus();
    const notaDevVenda = await emissao.emitirDevolucao(devVenda.id);
    checar(capturado && capturado.ref === `nfd-h-${devVenda.id}`, 'ref da devolução de venda continua nfd-<amb>-<devId>');
    const payloadVendaAgora = semDatas(capturado.payload);
    if (GERAR_FIXTURE) {
        fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
        fs.writeFileSync(FIXTURE, JSON.stringify({
            geradoEm: new Date().toISOString(),
            produtos: [prodA.codigo, prodB.codigo],
            aviso: 'Payload de emitirDevolucao para pedido NORMAL, gerado ANTES do despacho de bonificação (09/2026). Não regenerar sem motivo.',
            payload: payloadVendaAgora,
        }, null, 2));
        ok(`fixture gravada em ${FIXTURE}`);
        console.log(JSON.stringify(payloadVendaAgora, null, 2));
        await prisma.$disconnect();
        return;
    }
    const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    const antes = JSON.stringify(fixture.payload);
    const agora = JSON.stringify(payloadVendaAgora);
    if (antes !== agora) {
        console.error('    DIFERENÇA — antes:\n' + antes + '\n    agora:\n' + agora);
    }
    checar(antes === agora, `payload da devolução de VENDA é byte a byte igual à fixture (${agora.length} bytes; só data_emissao/data_entrada_saida excluídas)`);
    checar(payloadVendaAgora.natureza_operacao === 'Devolucao de venda' && payloadVendaAgora.items[0].cfop === '1201' || payloadVendaAgora.items[0].cfop === '1202', 'venda: natOp "Devolucao de venda" e CFOP 1201/1202');
    checar(notaDevVenda.tipo === 'DEVOLUCAO' && notaDevVenda.status === 'AUTORIZADO', 'venda: NotaFiscalApp tipo DEVOLUCAO autorizada');

    // ════════════════════════════════════════════════════════════════════════
    // (a) BN# SEM nota → devolução → recusa específica e NÃO cria NotaFiscalApp
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── (a) BN# sem NF-e autorizada ──');
    const bnSemNota = await criarPedido({ cliente: cliSC, vendedor, bonificacao: true, numero: 9890101, itens: itensPadrao, extra: { nfBonificacao: false } });
    const devSemNota = await devolucaoService.criarEspecial({
        pedidoId: bnSemNota.id, motivo: `${MARCA} sem nota`, registradoPorId: vendedor.id,
        itens: [{ produtoId: prodA.id, quantidade: 1 }],
    });
    checar(devSemNota.tipo === 'ESPECIAL', 'devolução da BN# é gravada como tipo ESPECIAL (como o ModalDevolucao faz hoje)');
    mockFocus();
    try {
        await emissao.emitirDevolucao(devSemNota.id);
        checar(false, 'deveria ter recusado');
    } catch (e) {
        console.log('    erro:', e.message);
        checar(e.message === 'Esta bonificação não tem NF-e autorizada — a devolução fica registrada só no estoque, sem nota fiscal.', 'mensagem específica de bonificação sem nota');
    }
    checar(capturado === null, 'Focus NÃO foi chamada');
    const notaSemNota = await prisma.notaFiscalApp.findUnique({ where: { ref: `nfd-h-${devSemNota.id}` } });
    checar(notaSemNota === null, 'NÃO criou NotaFiscalApp (motivo não é gravado — não há o que reemitir)');

    // ════════════════════════════════════════════════════════════════════════
    // (b) BN# COM nota AUTORIZADA → devolução parcial → payload fiscal
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── (b) BN# com NF-e autorizada → devolução parcial ──');
    const bnSC = await criarPedido({ cliente: cliSC, vendedor, bonificacao: true, numero: 9890102, itens: itensPadrao });
    const CHAVE_BN = '42260908766459000102550010000123451000123457';
    const notaBonif = await inserirNotaOriginal({ pedido: bnSC, tipo: 'BONIFICACAO', numero: 880002, chave: CHAVE_BN });
    checar(notaBonif.payloadEnviado.items[0].cfop === '5910', 'nota de bonificação de origem tem CFOP 5910 no payload');
    const estoqueAntesB = (await prisma.produto.findUnique({ where: { id: prodB.id }, select: { estoqueTotal: true } })).estoqueTotal;
    const devSC = await devolucaoService.criarEspecial({
        pedidoId: bnSC.id, motivo: `${MARCA} parcial`, registradoPorId: vendedor.id,
        itens: [{ produtoId: prodB.id, quantidade: 2 }], // só o 2º item da nota → nItem 2
    });
    mockFocus();
    const notaDevSC = await emissao.emitirDevolucao(devSC.id);
    const p = capturado.payload;
    console.log(JSON.stringify(p, null, 2));
    checar(capturado.ref === `nfd-h-${devSC.id}`, 'ref nfd-<amb>-<devId> (mesma da venda)');
    checar(p.natureza_operacao === 'Devolucao de mercadoria remetida a titulo de bonificacao', 'natureza_operacao da devolução de bonificação');
    checar(p.finalidade_emissao === 4 && p.tipo_documento === 0, 'finalidade 4 / tipo_documento 0 (entrada)');
    checar(p.local_destino === 1 && p.consumidor_final === 0 && p.presenca_comprador === 1, 'local_destino 1, consumidor_final 0 (CNPJ), presenca 1');
    checar(p.items.length === 1 && p.items[0].cfop === '1949', 'CFOP 1949 (SC)');
    checar(p.items[0].icms_situacao_tributaria === '102' && !('icms_aliquota_credito_simples' in p.items[0]) && !('icms_valor_credito_simples' in p.items[0]), 'CSOSN 102 sem campos de crédito do Simples');
    checar(p.items[0].pis_situacao_tributaria === '99' && p.items[0].cofins_situacao_tributaria === '99', 'PIS/COFINS 99');
    checar(!Object.keys(p.items[0]).some(k => k.startsWith('ipi_')), 'sem IPI');
    checar(p.items[0].quantidade_comercial === 2 && p.items[0].valor_unitario_comercial === 20.5 && p.items[0].valor_bruto === 41, 'quantidade/valor da DevolucaoItem (2 × 20,50 = 41,00)');
    checar(p.valor_produtos === 41 && p.valor_total === 41, 'valor_produtos = valor_total = soma');
    checar(JSON.stringify(p.notas_referenciadas) === JSON.stringify([{ chave_nfe: CHAVE_BN }]), 'referência de cabeçalho à NF-e da bonificação');
    checar(p.items[0].chave_acesso_dfe_referenciado === CHAVE_BN && p.items[0].numero_item_dfe_referenciado === '2', 'referência POR ITEM com nItem 2 (o produto era o 2º item da nota de origem)');
    checar(JSON.stringify(p.formas_pagamento) === JSON.stringify([{ forma_pagamento: '90', valor_pagamento: 0 }]), 'tPag 90 valor 0');
    checar(!Object.keys(p).some(k => /fatura|duplicata/.test(k)), 'sem fatura/duplicatas');
    console.log('    infoAdic:', p.informacoes_adicionais_contribuinte);
    // O separador de linha é '#', e os rótulos BN#/DEV# também levam '#' (mesma convenção
    // do "Referente ao pedido #N" da venda) — por isso a conferência é por trecho, não por split.
    const infoAdic = p.informacoes_adicionais_contribuinte;
    checar(infoAdic.startsWith('DEVOLUCAO DE MERCADORIA RECEBIDA EM BONIFICACAO (REMESSA CFOP 5910) - REFERENTE A NF-e N 1-880002 DE 01/09/2026#'), 'linha 1: CFOP de origem lido do payload + nº/série/data da nota original');
    checar(infoAdic.includes(`#Referente à bonificação BN#9890102 - devolução DEV#${devSC.numero}#`), 'linha 2: BN# e DEV#');
    checar(infoAdic.includes('#SEM COBRANCA E SEM EFEITO FINANCEIRO - MERCADORIA HAVIA SIDO REMETIDA SEM ONUS AO DESTINATARIO.#'), 'linha 3: sem cobrança e sem efeito financeiro');
    checar(!/APROVEITAMENTO DO CREDITO/.test(p.informacoes_adicionais_contribuinte), 'NUNCA a frase de aproveitamento de crédito de ICMS');
    checar(p.cnpj_destinatario === '98765432000110' && p.uf_destinatario === 'SC', 'destinatário = o cliente da bonificação');
    checar(notaDevSC.tipo === 'DEVOLUCAO' && notaDevSC.status === 'AUTORIZADO' && notaDevSC.numero === 900555, "NotaFiscalApp gravada com tipo 'DEVOLUCAO' e retorno da Focus aplicado");
    const bnDepois = await prisma.pedido.findUnique({ where: { id: bnSC.id }, select: { situacaoCA: true, statusEnvio: true, nfeConsultadoEm: true } });
    checar(bnDepois.situacaoCA === 'FATURADO' && bnDepois.nfeConsultadoEm === null, 'NÃO chamou marcarPedidoFaturado (situacaoCA/nfeConsultadoEm intocados)');

    // ════════════════════════════════════════════════════════════════════════
    // (g) estoque creditado UMA vez e conta a receber inexistente
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── (g) Estoque e financeiro ──');
    const movs = await prisma.movimentacaoEstoque.findMany({ where: { pedidoId: bnSC.id, motivo: 'DEVOLUCAO' }, select: { produtoId: true, quantidade: true, tipo: true } });
    console.log('    SELECT movimentacoes_estoque (motivo DEVOLUCAO, pedido BN#9890102):', JSON.stringify(movs));
    const estoqueDepoisB = (await prisma.produto.findUnique({ where: { id: prodB.id }, select: { estoqueTotal: true } })).estoqueTotal;
    console.log(`    estoque ${prodB.codigo}: antes=${estoqueAntesB} depois=${estoqueDepoisB}`);
    if (prodB.controlaEstoque === false) {
        info('produto não controla estoque — sem movimento esperado');
    } else {
        checar(movs.length === 1 && Number(movs[0].quantidade) === 2 && movs[0].tipo === 'ENTRADA', 'exatamente UMA entrada de estoque de 2 un. (a emissão da NF não credita de novo)');
        checar(Number(estoqueDepoisB) - Number(estoqueAntesB) === 2, 'estoqueTotal subiu exatamente 2');
    }
    const cr = await prisma.contaReceber.findUnique({ where: { pedidoId: bnSC.id } });
    console.log('    SELECT contas_receber (pedido BN#9890102):', JSON.stringify(cr));
    checar(cr === null, 'bonificação NÃO tem conta a receber (nenhum efeito financeiro)');

    // ════════════════════════════════════════════════════════════════════════
    // (e) idempotência
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── (e) Idempotência ──');
    mockFocus();
    try {
        await emissao.emitirDevolucao(devSC.id);
        checar(false, '2º clique deveria ter sido recusado');
    } catch (e) {
        console.log('    erro:', e.message);
        checar(e.message === 'Nota de devolução deste registro já está "AUTORIZADO".', 'mesma mensagem da venda');
    }
    checar(capturado === null, 'Focus NÃO foi chamada no 2º clique');

    // ════════════════════════════════════════════════════════════════════════
    // (c) cliente PR → 2949 / local_destino 2
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── (c) Cliente de outra UF (PR) ──');
    const bnPR = await criarPedido({ cliente: cliPR, vendedor, bonificacao: true, numero: 9890103, itens: itensPadrao });
    await inserirNotaOriginal({ pedido: bnPR, tipo: 'BONIFICACAO', numero: 880003, chave: '2'.repeat(44) });
    const devPR = await devolucaoService.criarEspecial({ pedidoId: bnPR.id, motivo: `${MARCA} PR`, registradoPorId: vendedor.id, itens: [{ produtoId: prodA.id, quantidade: 5 }, { produtoId: prodB.id, quantidade: 3 }] });
    mockFocus();
    await emissao.emitirDevolucao(devPR.id);
    checar(capturado.payload.items.every(i => i.cfop === '2949'), 'CFOP 2949 em todos os itens');
    checar(capturado.payload.local_destino === 2, 'local_destino 2');
    checar(capturado.payload.items.map(i => i.numero_item_dfe_referenciado).join(',') === '1,2', 'devolução TOTAL: nItem 1 e 2 na ordem');
    checar(/REMESSA CFOP 6910/.test(capturado.payload.informacoes_adicionais_contribuinte), 'infoAdic cita o CFOP 6910 da remessa interestadual');
    checar(devPR.escopo === 'TOTAL', 'escopo TOTAL');

    // ════════════════════════════════════════════════════════════════════════
    // (d) cliente CPF → consumidor_final 1
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── (d) Cliente CPF ──');
    const bnCPF = await criarPedido({ cliente: cliCPF, vendedor, bonificacao: true, numero: 9890104, itens: itensPadrao });
    await inserirNotaOriginal({ pedido: bnCPF, tipo: 'BONIFICACAO', numero: 880004, chave: '3'.repeat(44) });
    const devCPF = await devolucaoService.criarEspecial({ pedidoId: bnCPF.id, motivo: `${MARCA} CPF`, registradoPorId: vendedor.id, itens: [{ produtoId: prodA.id, quantidade: 1 }] });
    mockFocus();
    await emissao.emitirDevolucao(devCPF.id);
    checar(capturado.payload.consumidor_final === 1, 'consumidor_final 1');
    checar(capturado.payload.cpf_destinatario === '12345678909' && capturado.payload.indicador_inscricao_estadual_destinatario === 9, 'destinatário CPF, IE 9');
    checar(capturado.payload.items[0].icms_situacao_tributaria === '102', 'CSOSN 102 também no CPF');

    // ════════════════════════════════════════════════════════════════════════
    // (h) contrato do front: detalhar e listar devolvem nfBonificacaoAutorizada
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── (h) Contrato nfBonificacaoAutorizada ──');
    const det = await pedidoService.detalhar(bnSC.id);
    console.log('    detalhar(BN#9890102).nfBonificacaoAutorizada =', JSON.stringify(det.nfBonificacaoAutorizada));
    checar(JSON.stringify(det.nfBonificacaoAutorizada) === JSON.stringify({ id: notaBonif.id, numero: 880002, serie: 1, chave: CHAVE_BN }), 'detalhar: { id, numero, serie, chave } exatamente');
    const detSem = await pedidoService.detalhar(bnSemNota.id);
    checar(detSem.nfBonificacaoAutorizada === null, 'detalhar: null para BN# sem nota');
    const detVenda = await pedidoService.detalhar(pedVenda.id);
    checar(detVenda.nfBonificacaoAutorizada === null, 'detalhar: null para pedido normal (mesmo com NF de venda)');
    const lista = await devolucaoService.listar({ pagina: 1, tamanhoPagina: 200 });
    const lSC = lista.items.find(d => d.id === devSC.id);
    const lSem = lista.items.find(d => d.id === devSemNota.id);
    const lVenda = lista.items.find(d => d.id === devVenda.id);
    console.log('    listar → DEV da BN# com nota:', JSON.stringify(lSC.pedidoOriginal));
    checar(JSON.stringify(lSC.pedidoOriginal.nfBonificacaoAutorizada) === JSON.stringify({ id: notaBonif.id, numero: 880002, serie: 1, chave: CHAVE_BN }), 'listar: items[].pedidoOriginal.nfBonificacaoAutorizada preenchido');
    checar(lSC.notaFiscalDevolucao && lSC.notaFiscalDevolucao.status === 'AUTORIZADO', 'listar: notaFiscalDevolucao continua vindo (nfd-…)');
    checar(lSem.pedidoOriginal.nfBonificacaoAutorizada === null, 'listar: null na BN# sem nota');
    checar(lVenda.pedidoOriginal.nfBonificacaoAutorizada === null, 'listar: null no pedido normal');

    // ════════════════════════════════════════════════════════════════════════
    // (i) BN# com nota PROCESSANDO → null e recusa
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── (i) BN# com nota PROCESSANDO ──');
    const bnProc = await criarPedido({ cliente: cliSC, vendedor, bonificacao: true, numero: 9890105, itens: itensPadrao });
    await inserirNotaOriginal({ pedido: bnProc, tipo: 'BONIFICACAO', numero: null, chave: null, status: 'PROCESSANDO' });
    const detProc = await pedidoService.detalhar(bnProc.id);
    checar(detProc.nfBonificacaoAutorizada === null, 'detalhar: null com nota PROCESSANDO');
    const devProc = await devolucaoService.criarEspecial({ pedidoId: bnProc.id, motivo: `${MARCA} proc`, registradoPorId: vendedor.id, itens: [{ produtoId: prodA.id, quantidade: 1 }] });
    mockFocus();
    try {
        await emissao.emitirDevolucao(devProc.id);
        checar(false, 'deveria ter recusado');
    } catch (e) {
        console.log('    erro:', e.message);
        checar(/não tem NF-e autorizada/.test(e.message), 'recusa com a mensagem de bonificação sem NF-e autorizada');
    }
    checar(capturado === null && (await prisma.notaFiscalApp.findUnique({ where: { ref: `nfd-h-${devProc.id}` } })) === null, 'Focus não chamada e nada gravado');

    // ════════════════════════════════════════════════════════════════════════
    // (j) nota em ERRO → mensagemSefaz gravada e ERRO não trava a reemissão
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── (j) Rejeição → ERRO gravado → reemissão ──');
    const bnErro = await criarPedido({ cliente: cliSC, vendedor, bonificacao: true, numero: 9890106, itens: itensPadrao });
    await inserirNotaOriginal({ pedido: bnErro, tipo: 'BONIFICACAO', numero: 880006, chave: '5'.repeat(44) });
    const devErro = await devolucaoService.criarEspecial({ pedidoId: bnErro.id, motivo: `${MARCA} erro`, registradoPorId: vendedor.id, itens: [{ produtoId: prodA.id, quantidade: 1 }] });
    // j1: validação da Focus (422) → status ERRO com "Validação Focus: …"
    mockFocus({ httpStatus: 422, data: { mensagem: 'campo x invalido' } });
    try {
        await emissao.emitirDevolucao(devErro.id);
        checar(false, 'deveria ter lançado');
    } catch (e) {
        console.log('    erro:', e.message);
        checar(/recusada na validação: campo x invalido/.test(e.message), 'erro amigável da validação');
    }
    let nErro = await prisma.notaFiscalApp.findUnique({ where: { ref: `nfd-h-${devErro.id}` } });
    console.log('    NotaFiscalApp após 422:', JSON.stringify({ status: nErro.status, mensagemSefaz: nErro.mensagemSefaz, tipo: nErro.tipo }));
    checar(nErro.status === 'ERRO' && /Validação Focus: campo x invalido/.test(nErro.mensagemSefaz), 'status ERRO + mensagemSefaz gravados');
    // j2: referência por item não resolve → registrarErroNotaDevolucao grava o motivo
    const notaOrigErro = await prisma.notaFiscalApp.findUnique({ where: { ref: `nf-h-${bnErro.id}` } });
    const payloadOrig = notaOrigErro.payloadEnviado;
    await prisma.notaFiscalApp.update({ where: { id: notaOrigErro.id }, data: { payloadEnviado: { ...payloadOrig, items: payloadOrig.items.map(i => ({ ...i, codigo_produto: 'XXX-INEXISTENTE', descricao: 'OUTRA COISA' })) } } });
    mockFocus();
    try {
        await emissao.emitirDevolucao(devErro.id);
        checar(false, 'deveria ter recusado (item não consta)');
    } catch (e) {
        console.log('    erro:', e.message);
        checar(e.codigo === 'REF_ITEM' && /não consta na NF-e nº 880006/.test(e.message), 'mensagem de "não consta na NF-e" (mesmo texto da venda) com err.codigo REF_ITEM');
    }
    nErro = await prisma.notaFiscalApp.findUnique({ where: { ref: `nfd-h-${devErro.id}` } });
    checar(nErro.status === 'ERRO' && /não consta na NF-e nº 880006/.test(nErro.mensagemSefaz), 'registrarErroNotaDevolucao gravou o motivo em mensagemSefaz');
    checar(capturado === null, 'Focus não chamada quando a referência por item falha');
    // j3: corrige a origem e reemite — ERRO não trava
    await prisma.notaFiscalApp.update({ where: { id: notaOrigErro.id }, data: { payloadEnviado: payloadOrig } });
    mockFocus();
    const reemitida = await emissao.emitirDevolucao(devErro.id);
    checar(reemitida.status === 'AUTORIZADO' && reemitida.mensagemSefaz === undefined || reemitida.mensagemSefaz === null, 'reemissão após ERRO autorizada (mesma ref, update com PROCESSANDO → AUTORIZADO)');
    checar((await prisma.notaFiscalApp.count({ where: { pedidoId: bnErro.id, tipo: 'DEVOLUCAO' } })) === 1, 'continua UM registro nfd por devolução (update, não create)');

    // ════════════════════════════════════════════════════════════════════════
    // Travas: especial e notaDevolucaoCA (na devolução de BN#)
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── Travas: especial / notaDevolucaoCA / revertida ──');
    const bnCA = await criarPedido({ cliente: cliSC, vendedor, bonificacao: true, numero: 9890107, itens: itensPadrao });
    await inserirNotaOriginal({ pedido: bnCA, tipo: 'BONIFICACAO', numero: 880007, chave: '6'.repeat(44) });
    const devCA = await devolucaoService.criarEspecial({ pedidoId: bnCA.id, motivo: `${MARCA} ca`, registradoPorId: vendedor.id, itens: [{ produtoId: prodA.id, quantidade: 1 }] });
    await prisma.devolucao.update({ where: { id: devCA.id }, data: { notaDevolucaoCA: '77777' } });
    try { await emissao.emitirDevolucao(devCA.id); checar(false, 'deveria recusar'); }
    catch (e) { console.log('    erro:', e.message); checar(/já tem NF de devolução do Conta Azul \(nº 77777\)/.test(e.message), 'trava notaDevolucaoCA'); }
    await prisma.devolucao.update({ where: { id: devCA.id }, data: { notaDevolucaoCA: null, status: 'REVERTIDA' } });
    try { await emissao.emitirDevolucao(devCA.id); checar(false, 'deveria recusar'); }
    catch (e) { console.log('    erro:', e.message); checar(e.message === 'Devolução revertida não gera nota fiscal.', 'trava ATIVA vem antes do despacho'); }
    // Especial de verdade (pedido especial) continua recusando com a mensagem de sempre
    const esp = await criarPedido({ cliente: cliSC, vendedor, bonificacao: false, numero: 9890108, itens: itensPadrao, extra: { especial: true, nfBonificacao: false } });
    const devEsp = await devolucaoService.criarEspecial({ pedidoId: esp.id, motivo: `${MARCA} especial`, registradoPorId: vendedor.id, itens: [{ produtoId: prodA.id, quantidade: 1 }] });
    try { await emissao.emitirDevolucao(devEsp.id); checar(false, 'deveria recusar'); }
    catch (e) { console.log('    erro:', e.message); checar(e.message === 'Devolução de pedido especial não gera nota fiscal (pedido sem nota).', 'especial: mensagem de sempre'); }

    // Helpers exportados
    console.log('\n── Helpers exportados ──');
    const mapa = await emissao.mapaNotasBonificacaoAutorizadas([bnSC.id, bnSemNota.id, bnProc.id, pedVenda.id]);
    checar(mapa instanceof Map && mapa.size === 1 && mapa.get(bnSC.id)?.numero === 880002, 'mapaNotasBonificacaoAutorizadas: só a BN# com nota AUTORIZADA (ignora PROCESSANDO, sem nota e VENDA)');
    checar((await emissao.notaBonificacaoAutorizada(pedVenda.id)) === null, 'notaBonificacaoAutorizada ignora nota tipo VENDA do pedido normal');
    checar(emissao.resumoNotaParaFront(null) === null, 'resumoNotaParaFront(null) === null');
    const { nota: notaPura } = await emissao.montarNotaDevolucaoBonificacao({ dev: await prisma.devolucao.findUnique({ where: { id: devSC.id }, include: { itens: { include: { produto: true } } } }), pedido: bnSC, cliente: await prisma.cliente.findUnique({ where: { UUID: cliSC.UUID }, include: { fiscal: true } }), notaBonif, usarRefItem: false });
    checar(!('chave_acesso_dfe_referenciado' in notaPura.items[0]) && JSON.stringify(notaPura.notas_referenciadas) === JSON.stringify([{ chave_nfe: CHAVE_BN }]), 'montador puro com usarRefItem=false: sem ref por item, cabeçalho mantido');

    console.log('\n── IDs para o teste HTTP (diag) ──');
    console.log(JSON.stringify({ devSC: devSC.numero, devSemNota: devSemNota.numero, devVenda: devVenda.numero, devErro: devErro.numero }, null, 2));
    console.log('\n⚠️  A SEFAZ NÃO foi exercitada: a Focus foi simulada em todos os cenários.');
    focusNfe.emitir = emitirOriginal;
    await prisma.$disconnect();
})().catch(async e => { console.error('ERRO FATAL:', e); process.exitCode = 1; focusNfe.emitir = emitirOriginal; await prisma.$disconnect(); });
