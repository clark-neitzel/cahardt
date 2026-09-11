/**
 * Teste local da NF-e de BONIFICAÇÃO (banco hardt_local). Só escreve em registros de teste.
 * Uso: cd backend && node scripts/teste-nf-bonificacao.js
 */
require('dotenv').config();
const URL_BANCO = process.env.DATABASE_URL || '';
if (!URL_BANCO.includes('hardt_local')) {
    console.error('⛔ ABORTADO: só roda no banco LOCAL hardt_local.');
    process.exit(1);
}
process.env.FOCUS_NFE_AMBIENTE = 'homologacao';

const prisma = require('../config/database');
const emissao = require('../services/focusNfeEmissaoService');
const pedidoService = require('../services/pedidoService');

const MARCA = 'TESTE-NFBONIF';
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
        await prisma.notaFiscalApp.deleteMany({ where: { pedidoId: { in: ids } } });
        await prisma.movimentacaoEstoque.deleteMany({ where: { pedidoId: { in: ids } } });
        await prisma.pedidoItem.deleteMany({ where: { pedidoId: { in: ids } } });
        await prisma.contaReceber.deleteMany({ where: { pedidoId: { in: ids } } });
        await prisma.pedido.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.cliente.deleteMany({ where: { Nome: { startsWith: MARCA } } });
    // canhotos/notas do cenário 16 (chaves e refs fixas)
    await prisma.canhotoNota.deleteMany({ where: { chave: { in: ['3'.repeat(44), '5'.repeat(44)] } } });
    await prisma.notaFiscalApp.deleteMany({ where: { ref: { startsWith: 'nf-p-TESTECANHOTO-' } } });
}

async function criarCliente({ nome, doc, uf, cidade, incompleto = false }) {
    return prisma.cliente.create({
        data: {
            UUID: require('crypto').randomUUID(),
            Nome: `${MARCA} ${nome}`,
            Documento: doc,
            End_Logradouro: incompleto ? null : 'RUA DE TESTE',
            End_Numero: incompleto ? null : '100',
            End_Bairro: incompleto ? null : 'CENTRO',
            End_Cidade: incompleto ? null : cidade,
            End_Estado: incompleto ? null : uf,
            End_CEP: incompleto ? null : '89200000',
            Ativo: true,
        },
    });
}

(async () => {
    await limpar();

    const produto = await prisma.produto.findFirst({ where: { ativo: true }, select: { id: true, nome: true, codigo: true, ncm: true, unidade: true, nfeRevenda: true } });
    const vendedor = await prisma.vendedor.findFirst({ where: { login: 'Clarkson' }, select: { id: true, nome: true } });
    info(`produto: ${produto.codigo} ${produto.nome} | vendedor: ${vendedor.nome}`);

    const cliSC = await criarCliente({ nome: 'PADARIA SC', doc: '98765432000110', uf: 'SC', cidade: 'Joinville' });
    const cliPR = await criarCliente({ nome: 'MERCADO PR', doc: '45111222000133', uf: 'PR', cidade: 'Curitiba' });
    const cliCPF = await criarCliente({ nome: 'JOAO CPF', doc: '12345678909', uf: 'SC', cidade: 'Joinville' });
    const cliRuim = await criarCliente({ nome: 'MERCEARIA SEM CADASTRO', doc: '', uf: null, cidade: null, incompleto: true });

    const base = (clienteId, extra = {}) => ({
        clienteId, vendedorId: vendedor.id,
        dataVenda: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        observacoes: `${MARCA} cenario`,
        bonificacao: true, statusEnvio: 'ENVIAR',
        nomeCondicaoPagamento: 'Bonificação', tipoPagamento: 'DINHEIRO',
        itens: [{ produtoId: produto.id, quantidade: 2, valor: 33.235, valorBase: 33.235 }],
        nfBonificacaoPorId: vendedor.id, nfBonificacaoPorNome: vendedor.nome,
        ...extra,
    });

    console.log('\n── 1. Criar BN# COM NOTA (cliente CNPJ/SC) ──');
    const bnSC = await pedidoService.criar(base(cliSC.UUID, { nfBonificacao: true }));
    const gravSC = await prisma.pedido.findUnique({ where: { id: bnSC.id }, select: { numero: true, nfBonificacao: true, nfBonificacaoDefinidaPorNome: true, nfBonificacaoDefinidaEm: true, situacaoCA: true, statusEnvio: true } });
    console.log('   ', JSON.stringify(gravSC));
    checar(gravSC.nfBonificacao === true, 'nfBonificacao gravado true');
    checar(gravSC.nfBonificacaoDefinidaPorNome === vendedor.nome, 'carimbo de quem marcou gravado');
    const crSC = await prisma.contaReceber.findUnique({ where: { pedidoId: bnSC.id } });
    checar(crSC === null, 'bonificação NÃO gerou conta a receber');

    console.log('\n── 2. Criar BN# SEM NOTA ──');
    const bnSem = await pedidoService.criar(base(cliSC.UUID, { nfBonificacao: false }));
    const gravSem = await prisma.pedido.findUnique({ where: { id: bnSem.id }, select: { nfBonificacao: true, nfBonificacaoDefinidaPorNome: true } });
    console.log('   ', JSON.stringify(gravSem));
    checar(gravSem.nfBonificacao === false, 'nfBonificacao gravado false');

    console.log('\n── 3. Criar BN# COM NOTA para cliente de cadastro incompleto (tem que RECUSAR) ──');
    try {
        await pedidoService.criar(base(cliRuim.UUID, { nfBonificacao: true }));
        checar(false, 'deveria ter recusado');
    } catch (e) {
        console.log('    erro:', e.message);
        checar(/não pode receber nota: falta/.test(e.message), 'recusa com mensagem em português listando o que falta');
    }

    console.log('\n── 4. Emitir ANTES de aprovar (tem que RECUSAR) ──');
    try {
        await emissao.emitirVenda(bnSC.id);
        checar(false, 'deveria ter recusado');
    } catch (e) {
        console.log('    erro:', e.message);
        checar(e.message === 'Bonificação ainda não aprovada — aprove a bonificação antes de emitir a nota.', 'mensagem exata de "ainda não aprovada"');
    }

    console.log('\n── 5. Emitir uma BN# "sem nota" (tem que RECUSAR) ──');
    await prisma.pedido.update({ where: { id: bnSem.id }, data: { statusEnvio: 'RECEBIDO', situacaoCA: 'FATURADO' } });
    try {
        await emissao.emitirVenda(bnSem.id);
        checar(false, 'deveria ter recusado');
    } catch (e) {
        console.log('    erro:', e.message);
        checar(/foi registrada como "sem nota"/.test(e.message), 'mensagem exata de "sem nota"');
    }

    console.log('\n── 6. Aprovar a BN# com nota e montar o payload da NF-e ──');
    await prisma.pedido.update({ where: { id: bnSC.id }, data: { statusEnvio: 'RECEBIDO', situacaoCA: 'FATURADO', enviadoEm: new Date() } });
    const carregar = (id) => prisma.pedido.findUnique({ where: { id }, include: { cliente: { include: { fiscal: true } }, itens: { include: { produto: true } } } });

    const payloadSC = await emissao.montarNotaBonificacao(await carregar(bnSC.id));
    console.log(JSON.stringify(payloadSC, null, 2));
    checar(payloadSC.natureza_operacao === 'Remessa em bonificacao', 'natureza_operacao = "Remessa em bonificacao"');
    checar(payloadSC.finalidade_emissao === 1 && payloadSC.tipo_documento === 1, 'finalidade 1 / tipo_documento 1 (saída)');
    checar(payloadSC.local_destino === 1, 'local_destino 1 (dentro de SC)');
    checar(payloadSC.items.every(i => i.cfop === '5910'), 'CFOP 5910 em todos os itens (SC)');
    checar(payloadSC.items.every(i => i.icms_situacao_tributaria === '102'), 'CSOSN 102');
    checar(payloadSC.items.every(i => i.icms_aliquota_credito_simples === undefined && i.icms_valor_credito_simples === undefined), 'sem crédito do Simples nos itens');
    checar(payloadSC.items.every(i => i.pis_situacao_tributaria === '49' && i.cofins_situacao_tributaria === '49'), 'PIS/COFINS CST 49');
    checar(payloadSC.items.every(i => !('ipi_situacao_tributaria' in i)), 'IPI omitido');
    checar(JSON.stringify(payloadSC.formas_pagamento) === JSON.stringify([{ forma_pagamento: '90', valor_pagamento: 0 }]), 'tPag 90 / valor 0, sem indicador_pagamento');
    const chavesCobranca = Object.keys(payloadSC).filter(k => /fatura|duplicata/.test(k));
    checar(chavesCobranca.length === 0, 'SEM numero_fatura / duplicatas / valor_*_fatura (chaves encontradas: ' + JSON.stringify(chavesCobranca) + ')');
    // `pedido_itens.valor` é Decimal(12,2): 33,235 vira 33,24 no banco (igual à nota de venda).
    const itensSC = await prisma.pedidoItem.findMany({ where: { pedidoId: bnSC.id }, select: { quantidade: true, valor: true } });
    const totalEsperado = Math.round(itensSC.reduce((s, i) => s + Number(i.quantidade) * Number(i.valor), 0) * 100) / 100;
    checar(payloadSC.valor_produtos === totalEsperado && payloadSC.valor_total === totalEsperado, `valor_produtos = valor_total = ${totalEsperado} (soma dos itens gravados)`);
    console.log('    infoAdic:', payloadSC.informacoes_adicionais_contribuinte);
    checar(payloadSC.informacoes_adicionais_contribuinte.startsWith('MERCADORIA ENTREGUE EM BONIFICACAO - SEM COBRANCA AO DESTINATARIO.'), 'infoAdic começa com a frase da bonificação');
    checar(payloadSC.informacoes_adicionais_contribuinte.includes(`Referente à bonificação BN#${gravSC.numero}`), 'infoAdic cita o BN# do pedido');
    checar(payloadSC.informacoes_adicionais_contribuinte.includes(MARCA), 'infoAdic traz as observações do pedido');
    checar(!/PERMITE O APROVEITAMENTO DO CREDITO DE ICMS/.test(payloadSC.informacoes_adicionais_contribuinte), 'infoAdic NÃO tem a frase de crédito de ICMS (é do CSOSN 101)');
    checar(payloadSC.cnpj_destinatario === '98765432000110', 'destinatário CNPJ');

    console.log('\n── 7. Cliente de OUTRA UF (PR) → CFOP 6910 ──');
    const bnPR = await pedidoService.criar(base(cliPR.UUID, { nfBonificacao: true }));
    await prisma.pedido.update({ where: { id: bnPR.id }, data: { statusEnvio: 'RECEBIDO' } });
    const payloadPR = await emissao.montarNotaBonificacao(await carregar(bnPR.id));
    checar(payloadPR.items.every(i => i.cfop === '6910'), 'CFOP 6910 (interestadual)');
    checar(payloadPR.local_destino === 2, 'local_destino 2 (interestadual)');

    console.log('\n── 8. Cliente CPF ──');
    const bnCPF = await pedidoService.criar(base(cliCPF.UUID, { nfBonificacao: true }));
    await prisma.pedido.update({ where: { id: bnCPF.id }, data: { statusEnvio: 'RECEBIDO' } });
    const payloadCPF = await emissao.montarNotaBonificacao(await carregar(bnCPF.id));
    checar(payloadCPF.cpf_destinatario === '12345678909' && !payloadCPF.cnpj_destinatario, 'destinatário CPF');
    checar(payloadCPF.items.every(i => i.icms_situacao_tributaria === '102'), 'CSOSN 102 também para CPF');
    checar(payloadCPF.consumidor_final === 1, 'consumidor_final = 1 no CPF');

    console.log('\n── 9. Nota de VENDA não mudou (regressão) ──');
    const pedVenda = await prisma.pedido.findFirst({
        where: { bonificacao: false, especial: false, cancelado: false, numero: { not: null }, itens: { some: {} }, cliente: { Documento: { not: null }, End_CEP: { not: null }, End_Numero: { not: null }, End_Bairro: { not: null } } },
        include: { cliente: { include: { fiscal: true } }, itens: { include: { produto: true } } },
        orderBy: { numero: 'desc' },
    });
    const payloadVenda = await emissao.montarNotaVenda(pedVenda);
    console.log(`    pedido #${pedVenda.numero} → natOp="${payloadVenda.natureza_operacao}" cfop=${payloadVenda.items[0].cfop} csosn=${payloadVenda.items[0].icms_situacao_tributaria} tPag=${payloadVenda.formas_pagamento[0].forma_pagamento} fatura=${'numero_fatura' in payloadVenda}`);
    checar(/^Venda /.test(payloadVenda.natureza_operacao), 'venda continua com natOp de venda');
    checar(['5101', '5102', '6101', '6102'].includes(payloadVenda.items[0].cfop), 'venda continua com CFOP de venda');

    console.log('\n── 10. Idempotência: nota já AUTORIZADA recusa 2º clique ──');
    const ref = `nf-h-${bnSC.id}`;
    await prisma.notaFiscalApp.create({ data: { ref, ambiente: 'homologacao', tipo: 'BONIFICACAO', pedidoId: bnSC.id, status: 'AUTORIZADO', numero: 999001, chave: '4'.repeat(44) } });
    try {
        await emissao.emitirVenda(bnSC.id);
        checar(false, 'deveria ter recusado');
    } catch (e) {
        console.log('    erro:', e.message);
        checar(/já está "AUTORIZADO"/.test(e.message), 'recusa por idempotência');
    }

    console.log('\n── 11. A nota NÃO altera o situacaoCA da bonificação ──');
    await prisma.pedido.update({ where: { id: bnSC.id }, data: { situacaoCA: 'FATURADO' } });
    const notaProd = await prisma.notaFiscalApp.create({ data: { ref: `nf-p-${bnSC.id}`, ambiente: 'producao', tipo: 'VENDA', pedidoId: bnSC.id, status: 'AUTORIZADO', numero: 999002 } });
    // Simula uma bonificação REVERTIDA (situacaoCA null) e chama a auto-cura
    await prisma.pedido.update({ where: { id: bnSC.id }, data: { situacaoCA: null, statusEnvio: 'ABERTO' } });
    await emissao.sincronizarEventos();
    const depois = await prisma.pedido.findUnique({ where: { id: bnSC.id }, select: { situacaoCA: true, statusEnvio: true } });
    console.log('    após sincronizarEventos():', JSON.stringify(depois));
    checar(depois.situacaoCA === null, 'situacaoCA da bonificação revertida CONTINUA null (a nota não a "conserta")');
    await prisma.notaFiscalApp.delete({ where: { id: notaProd.id } });

    console.log('\n── 12. Listagem da aba Bonificações: chips e notaApp ──');
    await prisma.pedido.update({ where: { id: bnSC.id }, data: { situacaoCA: 'FATURADO', statusEnvio: 'RECEBIDO' } });
    const lista = await pedidoService.listar({ bonificacao: 'true', pagina: 1, tamanhoPagina: 200 });
    console.log('    contagensNota:', JSON.stringify(lista.contagensNota));
    checar(lista.contagensNota && typeof lista.contagensNota.com === 'number', 'contagensNota devolvido na aba bonificação');
    const linhaSC = lista.items.find(p => p.id === bnSC.id);
    console.log('    linha BN#' + linhaSC.numero + ':', JSON.stringify({ nfBonificacao: linhaSC.nfBonificacao, por: linhaSC.nfBonificacaoDefinidaPorNome, notaApp: linhaSC.notaApp }));
    checar(linhaSC.notaApp && linhaSC.notaApp.numero === 999001, 'notaApp da bonificação com número da nota');
    const linhaPR = lista.items.find(p => p.id === bnPR.id);
    checar(linhaPR.notaApp === null, 'notaApp null quando não há nota');

    console.log('\n    chip "pendente":');
    const pend = await pedidoService.listar({ bonificacao: 'true', notaBonificacao: 'pendente', pagina: 1, tamanhoPagina: 200 });
    const idsPend = pend.items.map(p => p.id);
    checar(!idsPend.includes(bnSC.id), 'BN# com nota AUTORIZADA sai do chip "pendente"');
    checar(idsPend.includes(bnPR.id), 'BN# com nota marcada e sem emitir aparece no chip "pendente"');
    console.log('    pendentes:', pend.total, '| contagensNota do chip:', JSON.stringify(pend.contagensNota));
    const semNota = await pedidoService.listar({ bonificacao: 'true', notaBonificacao: 'sem', pagina: 1, tamanhoPagina: 200 });
    checar(semNota.items.every(p => p.nfBonificacao === false), 'chip "sem" só traz nfBonificacao=false');
    checar(semNota.contagensNota.com === pend.contagensNota.com, 'contagem dos chips NÃO é filtrada pelo chip selecionado');

    console.log('\n── 13. Canhoto: elegibilidade ──');
    const canhoto = require('../services/canhotoService');
    checar(canhoto.pedidoElegivel({ bonificacao: true, nfBonificacao: true }) === true, 'BN# com nota é elegível a canhoto');
    checar(canhoto.pedidoElegivel({ bonificacao: true, nfBonificacao: false }) === false, 'BN# sem nota NÃO é elegível');
    checar(canhoto.pedidoElegivel({ especial: true }) === false, 'especial continua fora');
    checar(canhoto.pedidoElegivel({ bonificacao: false }) === true, 'venda continua elegível');

    console.log('\n── 14. Recibo do BN# em PDF ──');
    const { gerarReciboEspecial } = require('../services/reciboEspecialPdf');
    const pedRecibo = await prisma.pedido.findUnique({ where: { id: bnSC.id }, include: { cliente: true, vendedor: true, itens: { include: { produto: true } }, notasFiscaisApp: { select: { status: true, numero: true, tipo: true } } } });
    const pdf = await gerarReciboEspecial(pedRecibo);
    require('fs').writeFileSync('/tmp/recibo-bn-comnota.pdf', pdf);
    checar(pdf.length > 1000, `recibo COM NOTA gerado (${pdf.length} bytes) → /tmp/recibo-bn-comnota.pdf`);
    const pedReciboSem = await prisma.pedido.findUnique({ where: { id: bnSem.id }, include: { cliente: true, vendedor: true, itens: { include: { produto: true } }, notasFiscaisApp: { select: { status: true, numero: true, tipo: true } } } });
    require('fs').writeFileSync('/tmp/recibo-bn-semnota.pdf', await gerarReciboEspecial(pedReciboSem));
    ok('recibo SEM NOTA gerado → /tmp/recibo-bn-semnota.pdf');

    console.log('\n── 15. emitirVenda() ponta a ponta com a Focus SIMULADA ──');
    // Sem token da Focus no ambiente local, a chamada HTTP real é impossível. Aqui o
    // cliente HTTP é substituído para CAPTURAR o payload que iria para a Focus e devolver
    // um "autorizado" — prova que a rota atravessa todas as travas, grava tipo BONIFICACAO
    // e NÃO mexe no situacaoCA do pedido. A validação da SEFAZ continua PENDENTE.
    const focusNfe = require('../services/focusNfeService');
    const emitirOriginal = focusNfe.emitir;
    let capturado = null;
    focusNfe.emitir = async (ref, payload) => {
        capturado = { ref, payload };
        return { httpStatus: 200, data: { status: 'autorizado', numero: '900123', serie: '1', chave_nfe: '9'.repeat(44) } };
    };
    try {
        const bnE2E = await pedidoService.criar(base(cliSC.UUID, { nfBonificacao: true }));
        await prisma.pedido.update({ where: { id: bnE2E.id }, data: { statusEnvio: 'RECEBIDO', situacaoCA: 'FATURADO' } });
        const antes = await prisma.pedido.findUnique({ where: { id: bnE2E.id }, select: { numero: true, situacaoCA: true, statusEnvio: true, nfeConsultadoEm: true } });
        console.log('    SELECT antes:', JSON.stringify(antes));
        const notaEmitida = await emissao.emitirVenda(bnE2E.id);
        const depoisE2E = await prisma.pedido.findUnique({ where: { id: bnE2E.id }, select: { numero: true, situacaoCA: true, statusEnvio: true, nfeConsultadoEm: true } });
        console.log('    SELECT depois:', JSON.stringify(depoisE2E));
        console.log('    ref enviada à Focus:', capturado.ref);
        console.log('    NotaFiscalApp:', JSON.stringify({ tipo: notaEmitida.tipo, status: notaEmitida.status, numero: notaEmitida.numero, ambiente: notaEmitida.ambiente }));
        checar(capturado.ref === `nf-h-${bnE2E.id}`, 'ref mantida no padrão nf-<amb>-<pedidoId>');
        checar(capturado.payload.natureza_operacao === 'Remessa em bonificacao' && capturado.payload.items[0].cfop === '5910', 'payload enviado é o da bonificação');
        checar(notaEmitida.tipo === 'BONIFICACAO', "NotaFiscalApp gravada com tipo 'BONIFICACAO'");
        checar(notaEmitida.status === 'AUTORIZADO' && notaEmitida.numero === 900123, 'retorno da Focus aplicado no registro');
        checar(depoisE2E.situacaoCA === antes.situacaoCA && depoisE2E.nfeConsultadoEm === antes.nfeConsultadoEm, 'emitir a nota NÃO alterou situacaoCA nem nfeConsultadoEm da bonificação');

        // 2º clique no mesmo botão
        try {
            await emissao.emitirVenda(bnE2E.id);
            checar(false, 'segundo clique deveria ter sido recusado');
        } catch (e2) {
            console.log('    2º clique:', e2.message);
            checar(/já está "AUTORIZADO"/.test(e2.message), 'segundo clique recusado (idempotência)');
        }

        // Mesmo caminho numa VENDA: aí SIM tem que faturar (regressão)
        const notaVendaSim = { pedidoId: pedVenda.id, status: 'AUTORIZADO', ambiente: 'producao', tipo: 'VENDA' };
        const vendaAntes = await prisma.pedido.findUnique({ where: { id: pedVenda.id }, select: { situacaoCA: true } });
        await require('../services/focusNfeEmissaoService');
        // marcarPedidoFaturado não é exportada — exercitada pelo caminho público:
        await prisma.pedido.update({ where: { id: pedVenda.id }, data: { situacaoCA: null } });
        await prisma.notaFiscalApp.upsert({
            where: { ref: `nf-p-${pedVenda.id}` },
            update: { status: 'AUTORIZADO', ambiente: 'producao', tipo: 'VENDA' },
            create: { ref: `nf-p-${pedVenda.id}`, ambiente: 'producao', tipo: 'VENDA', pedidoId: pedVenda.id, status: 'AUTORIZADO', numero: 900124 },
        });
        await emissao.sincronizarEventos();
        const vendaDepois = await prisma.pedido.findUnique({ where: { id: pedVenda.id }, select: { situacaoCA: true } });
        console.log(`    venda #${pedVenda.numero}: situacaoCA ${JSON.stringify(vendaAntes.situacaoCA)} → forçado null → auto-cura → ${JSON.stringify(vendaDepois.situacaoCA)}`);
        checar(vendaDepois.situacaoCA === 'FATURADO', 'VENDA continua sendo faturada pela nota (regressão preservada)');
        await prisma.notaFiscalApp.deleteMany({ where: { ref: `nf-p-${pedVenda.id}` } });
        await prisma.pedido.update({ where: { id: pedVenda.id }, data: { situacaoCA: vendaAntes.situacaoCA } });
    } finally {
        focusNfe.emitir = emitirOriginal;
    }

    console.log('\n── 16. Canhoto da bonificação CAI no alerta de atraso (correção 09/2026) ──');
    // O alerta ("canhoto na rua há N dias", tarja vermelha) é o mecanismo que faz o papel
    // voltar. Antes da correção ele filtrava `tipo: 'VENDA'` e a BN# ficava de fora.
    {
        const canhotoCfg = require('../config/canhotoConfig');
        const cfgCanhoto = await canhotoCfg.get();
        const diasAlerta = cfgCanhoto.diasAlerta;
        const bnCanhoto = await pedidoService.criar(base(cliSC.UUID, { nfBonificacao: true }));
        await prisma.pedido.update({ where: { id: bnCanhoto.id }, data: { statusEnvio: 'RECEBIDO', situacaoCA: 'FATURADO' } });
        const pedVendaCanhoto = await prisma.pedido.findFirst({
            where: { bonificacao: false, especial: false, cancelado: false, numero: { not: null } },
            orderBy: { numero: 'desc' }, select: { id: true, numero: true },
        });

        // Duas notas de PRODUÇÃO autorizadas, ambas emitidas há (diasAlerta + 5) dias:
        // uma de bonificação, uma de venda (controle).
        const atrasoMs = (diasAlerta + 5) * 86400000;
        const emitidaEm = new Date(Date.now() - atrasoMs);
        const chaveBN = '3'.repeat(44);
        const chaveVN = '5'.repeat(44);
        await prisma.canhotoNota.deleteMany({ where: { chave: { in: [chaveBN, chaveVN] } } });
        const notaBN = await prisma.notaFiscalApp.create({ data: { ref: `nf-p-${bnCanhoto.id}`, ambiente: 'producao', tipo: 'BONIFICACAO', pedidoId: bnCanhoto.id, status: 'AUTORIZADO', numero: 970001, serie: 1, chave: chaveBN, criadoEm: emitidaEm } });
        const notaVN = await prisma.notaFiscalApp.create({ data: { ref: `nf-p-TESTECANHOTO-${pedVendaCanhoto.id}`, ambiente: 'producao', tipo: 'VENDA', pedidoId: pedVendaCanhoto.id, status: 'AUTORIZADO', numero: 970002, serie: 1, chave: chaveVN, criadoEm: emitidaEm } });

        const canhoto = require('../services/canhotoService');
        const cBN = await canhoto.registrarDeNotaApp(notaBN, { statusInicial: 'AGUARDANDO' });
        const cVN = await canhoto.registrarDeNotaApp(notaVN, { statusInicial: 'AGUARDANDO' });
        console.log('    canhoto da BN#:', cBN ? JSON.stringify({ numero: cBN.numero, tipo: cBN.tipo, status: cBN.status }) : 'NÃO REGISTRADO');
        checar(!!cBN && cBN.tipo === 'BONIFICACAO', "canhoto da bonificação registrado com tipo 'BONIFICACAO'");
        checar(!!cBN && cBN.status === 'AGUARDANDO', 'canhoto da bonificação nasce AGUARDANDO (na rua)');

        // Empurra as duas para trás (o registro nasce com emitidaEm da nota, mas saiuEm/criadoEm são de agora)
        await prisma.canhotoNota.updateMany({ where: { chave: { in: [chaveBN, chaveVN] } }, data: { emitidaEm, saiuEm: emitidaEm } });

        const de = new Date(Date.now() - (diasAlerta + 40) * 86400000).toISOString().slice(0, 10);
        const ate = new Date().toISOString().slice(0, 10);
        const lista = await canhoto.listarPeriodo({ de, ate, autocura: false });
        const numsAlerta = (lista.alerta || []).map(a => a.numero); // `alerta` é a chave da tarja vermelha
        console.log(`    diasAlerta configurado: ${diasAlerta} | período ${de}..${ate}`);
        console.log('    números na tarja vermelha (amostra):', numsAlerta.slice(0, 12));
        checar(numsAlerta.includes(970001), 'canhoto da BONIFICAÇÃO aparece no alerta de atraso ✅ (era o defeito)');
        checar(numsAlerta.includes(970002), 'canhoto da VENDA continua no alerta (regressão)');
        checar((lista.alerta || []).every(a => a.tipo !== 'DEVOLUCAO'), 'nenhuma DEVOLUÇÃO no alerta');

        // Prova de que a correção é a CAUSA: o WHERE antigo (`tipo: 'VENDA'`) não acha a BN#.
        const whereAlerta = (filtroTipo) => ({
            emitidaEm: { gte: new Date(`${de}T00:00:00-03:00`), lte: new Date(`${ate}T23:59:59-03:00`) },
            ...filtroTipo,
            status: 'AGUARDANDO',
            OR: [{ saiuEm: { lte: new Date(Date.now() - diasAlerta * 86400000) } }, { saiuEm: null, emitidaEm: { lte: new Date(Date.now() - diasAlerta * 86400000) } }],
        });
        const achaAntigoAlerta = await prisma.canhotoNota.count({ where: { ...whereAlerta({ tipo: 'VENDA' }), numero: 970001 } });
        const achaNovoAlerta = await prisma.canhotoNota.count({ where: { ...whereAlerta({ tipo: { not: 'DEVOLUCAO' } }), numero: 970001 } });
        console.log(`    alerta: WHERE antigo (tipo:'VENDA') acha a BN#? ${achaAntigoAlerta === 1} | WHERE novo (tipo not DEVOLUCAO)? ${achaNovoAlerta === 1}`);
        checar(achaAntigoAlerta === 0 && achaNovoAlerta === 1, "o defeito era o `tipo: 'VENDA'` — WHERE antigo não achava, o novo acha");

        // canhotos-diag (adminExec): a BN# sem canhoto tem que aparecer como buraco
        await prisma.canhotoNota.deleteMany({ where: { chave: chaveBN } });
        const PEDIDO_ELEGIVEL_CANHOTO = {
            especial: false, cancelado: false, statusEnvio: { not: 'EXCLUIDO' },
            AND: [
                { OR: [{ situacaoCA: null }, { situacaoCA: { notIn: ['CANCELADO', 'EXCLUIDO'] } }] },
                { OR: [{ bonificacao: false }, { bonificacao: true, nfBonificacao: true }] },
            ],
        };
        const antigo = { especial: false, bonificacao: false, cancelado: false, statusEnvio: { not: 'EXCLUIDO' }, OR: [{ situacaoCA: null }, { situacaoCA: { notIn: ['CANCELADO', 'EXCLUIDO'] } }] };
        const achaNovo = await prisma.notaFiscalApp.count({ where: { id: notaBN.id, pedido: PEDIDO_ELEGIVEL_CANHOTO } });
        const achaAntigo = await prisma.notaFiscalApp.count({ where: { id: notaBN.id, pedido: antigo } });
        console.log(`    canhotos-diag: filtro NOVO acha a nota da BN# sem canhoto? ${achaNovo === 1} | filtro ANTIGO? ${achaAntigo === 1}`);
        checar(achaNovo === 1 && achaAntigo === 0, 'canhotos-diag passa a enxergar a BN# com nota sem canhoto (antes era invisível)');

        await prisma.canhotoNota.deleteMany({ where: { chave: { in: [chaveBN, chaveVN] } } });
        await prisma.notaFiscalApp.deleteMany({ where: { id: { in: [notaBN.id, notaVN.id] } } });
    }

    console.log('\n── 17. Carimbo "quem decidiu pela nota" não é reescrito por edição ──');
    {
        const bnCarimbo = await pedidoService.criar(base(cliSC.UUID, { nfBonificacao: true }));
        const c0 = await prisma.pedido.findUnique({ where: { id: bnCarimbo.id }, select: { nfBonificacao: true, nfBonificacaoDefinidaEm: true, nfBonificacaoDefinidaPorNome: true } });
        console.log('    ao criar:      ', JSON.stringify(c0));

        // Edição que NÃO muda a escolha (é o que o NovoPedido faz em todo salvamento)
        await pedidoService.editar(bnCarimbo.id, {
            clienteId: cliSC.UUID, vendedorId: vendedor.id, statusEnvio: 'ENVIAR',
            observacoes: `${MARCA} cenario editado`, dataVenda: new Date().toISOString().slice(0, 10),
            bonificacao: true, nfBonificacao: true, // mesmo valor
            itens: [{ produtoId: produto.id, quantidade: 3, valor: 33.235, valorBase: 33.235 }],
            nfBonificacaoPorId: 'OUTRO-USUARIO', nfBonificacaoPorNome: 'Fulano Que So Editou',
        });
        const c1 = await prisma.pedido.findUnique({ where: { id: bnCarimbo.id }, select: { nfBonificacao: true, nfBonificacaoDefinidaEm: true, nfBonificacaoDefinidaPorNome: true } });
        console.log('    após editar (mesmo valor):', JSON.stringify(c1));
        checar(c1.nfBonificacaoDefinidaPorNome === c0.nfBonificacaoDefinidaPorNome, 'edição sem mudar a escolha NÃO troca quem decidiu');
        checar(+c1.nfBonificacaoDefinidaEm === +c0.nfBonificacaoDefinidaEm, 'edição sem mudar a escolha NÃO reescreve a data');

        // Edição que MUDA a escolha → carimbo novo
        await pedidoService.editar(bnCarimbo.id, {
            clienteId: cliSC.UUID, vendedorId: vendedor.id, statusEnvio: 'ENVIAR',
            observacoes: `${MARCA} cenario`, dataVenda: new Date().toISOString().slice(0, 10),
            bonificacao: true, nfBonificacao: false, // MUDOU
            itens: [{ produtoId: produto.id, quantidade: 3, valor: 33.235, valorBase: 33.235 }],
            nfBonificacaoPorId: 'OUTRO-USUARIO', nfBonificacaoPorNome: 'Fulano Que Mudou',
        });
        const c2 = await prisma.pedido.findUnique({ where: { id: bnCarimbo.id }, select: { nfBonificacao: true, nfBonificacaoDefinidaEm: true, nfBonificacaoDefinidaPorNome: true } });
        console.log('    após mudar a escolha:     ', JSON.stringify(c2));
        checar(c2.nfBonificacao === false, 'escolha mudou para "sem nota"');
        checar(c2.nfBonificacaoDefinidaPorNome === 'Fulano Que Mudou', 'carimbo NOVO quando a escolha muda de verdade');
        checar(+c2.nfBonificacaoDefinidaEm > +c0.nfBonificacaoDefinidaEm, 'data do carimbo atualizada quando a escolha muda');
    }

    console.log('\n── IDs para o teste HTTP ──');
    console.log(JSON.stringify({ bnSC: bnSC.id, bnSem: bnSem.id, bnPR: bnPR.id, bnCPF: bnCPF.id, numeroSC: gravSC.numero }, null, 2));
    await prisma.$disconnect();
})().catch(async e => { console.error('ERRO FATAL:', e); process.exitCode = 1; await prisma.$disconnect(); });
