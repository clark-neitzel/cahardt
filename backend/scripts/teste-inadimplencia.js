/**
 * Teste da INADIMPLÊNCIA VISÍVEL (services/inadimplenciaService) — Entrega 1.
 *
 *   node scripts/teste-inadimplencia.js            -> casos puros (sem banco)
 *   node scripts/teste-inadimplencia.js --hoje     -> + roda a função pura contra a cópia de
 *                                                    produção do schema `hoje` do banco hardt_diag
 *                                                    (psql local; colunas text) e imprime a contagem
 *
 * Não escreve em banco nenhum (só lê via psql). Não precisa de servidor.
 */
const { execSync } = require('child_process');
const assert = require('assert');
const inad = require('../services/inadimplenciaService');
const { contasAguardandoConferencia } = require('../services/recebimentoEntregaService');

const CFG = { carenciaDias: 3, valorMinimoBloqueio: 50, prazoAConfirmarDias: 7, funcionarioFora: true, motoristaVeAtraso: true, siteExigeResponsavel: true };
const HOJE = process.argv.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || '2026-10-14';
let ok = 0, falhas = 0;
const t = (nome, fn) => { try { fn(); ok++; console.log('  ok   ', nome); } catch (e) { falhas++; console.log('  FALHA', nome, '->', e.message); } };

const diasAtras = (n) => new Date(Date.parse(`${HOJE}T12:00:00Z`) - n * 86400000);
const venc = (n) => new Date(Date.parse(`${HOJE}T00:00:00Z`) - n * 86400000); // vencida há n dias
const parc = (valor, diasVencida, extra = {}) => ({ id: 'p' + Math.random(), numeroParcela: 1, valor, valorPago: 0, valorDescontoTotal: 0, status: 'PENDENTE', dataVencimento: venc(diasVencida), ...extra });
const pg = (forma, valor, extra = {}) => ({ formaPagamentoNome: forma, valor, cobrancaAsaasId: null, asaasRecebido: false, createdAt: diasAtras(0), responsavelPapel: null, escritorioResponsavel: false, vendedorResponsavelId: null, ...extra });
const conta = (parcelas, pedido) => ({ id: 'c', parcelas, pedido });
const ped = (extra = {}) => ({ especial: false, statusEntrega: 'ENTREGUE', dataEntrega: diasAtras(10), nomeCondicaoPagamento: '7 dias - Boleto', pagamentosReais: [], ...extra });

console.log('classificarFormaApontada');
const FORMAS = { 'Boleto - Pix': 'BOLETO', 'Boleto 7 dias - Dinheiro': 'BOLETO', 'Cartão de Débito': 'CARTAO', 'Cartao': 'CARTAO', 'Escritório (cartão)': 'CARTAO', 'À vista - Dinheiro': 'DINHEIRO', '7 dias - Boleto': 'BOLETO', 'À vista - Pix': 'PIX', '14 dias - Boleto': 'BOLETO', 'Escritório responsável': 'RESPONSAVEL', 'Bonificação': 'BONIFICACAO', 'PIX Asaas': 'PIX_ASAAS', 'À vista - Funcionário': 'FUNCIONARIO', '7/14 dias': 'PRAZO', '28 dias - Boleto': 'BOLETO', '21 dias - Boleto': 'BOLETO', 'Vendedor responsável': 'RESPONSAVEL', 'PIX Asaas (ESTORNADO)': 'OUTRA', 'Cartão - Crédito': 'CARTAO', 'Qualquer coisa nova': 'OUTRA', '': 'OUTRA' };
for (const [nome, esperado] of Object.entries(FORMAS)) t(`"${nome}" -> ${esperado}`, () => assert.strictEqual(inad.classificarFormaApontada(nome), esperado));

console.log('classificarConta');
t('boleto apontado (Gourmet) vencido há 57d = DEVE, não escondido', () => {
    const r = inad.classificarConta(conta([parc(642.38, 57)], ped({ pagamentosReais: [pg('7 dias - Boleto', 642.38)] })), CFG, HOJE);
    assert.strictEqual(r.destino, 'DEVE'); assert.strictEqual(r.vencidas.length, 1); assert.strictEqual(r.vencidas[0].diasAtraso, 57);
});
t('Pix apontado há 46d cobrindo o saldo = A_CONFIRMAR (não DEVE)', () => {
    const r = inad.classificarConta(conta([parc(322.44, 46)], ped({ dataEntrega: diasAtras(46), pagamentosReais: [pg('À vista - Pix', 322.44, { createdAt: diasAtras(46) })] })), CFG, HOJE);
    assert.strictEqual(r.destino, 'A_CONFIRMAR'); assert.strictEqual(r.aConfirmar.forma, 'Pix'); assert.strictEqual(r.aConfirmar.dias, 46);
});
t('Pix de hoje cobrindo o saldo = EM_ESPERA', () => {
    const r = inad.classificarConta(conta([parc(100, 0)], ped({ dataEntrega: diasAtras(0), pagamentosReais: [pg('À vista - Pix', 100)] })), CFG, HOJE);
    assert.strictEqual(r.destino, 'EM_ESPERA');
});
t('Pix de 3 dias com parcela vencida = EM_ESPERA (dentro do prazo de 7d)', () => {
    const r = inad.classificarConta(conta([parc(100, 3)], ped({ dataEntrega: diasAtras(3), pagamentosReais: [pg('À vista - Pix', 100)] })), CFG, HOJE);
    assert.strictEqual(r.destino, 'EM_ESPERA');
});
t('P4: DINHEIRO apontado e nunca conferido há 20d = A_CONFIRMAR', () => {
    const r = inad.classificarConta(conta([parc(80, 20)], ped({ dataEntrega: diasAtras(20), pagamentosReais: [pg('À vista - Dinheiro', 80)] })), CFG, HOJE);
    assert.strictEqual(r.destino, 'A_CONFIRMAR'); assert.strictEqual(r.aConfirmar.forma, 'Dinheiro');
});
t('Pix cobrindo só parte + resto em boleto = DEVE pelo saldo todo', () => {
    const r = inad.classificarConta(conta([parc(200, 10)], ped({ pagamentosReais: [pg('À vista - Pix', 80), pg('7 dias - Boleto', 120)] })), CFG, HOJE);
    assert.strictEqual(r.destino, 'DEVE'); assert.strictEqual(r.vencidas[0].saldo, 200);
});
t('responsável (escritório) não é recebimento = DEVE', () => {
    const r = inad.classificarConta(conta([parc(150, 10)], ped({ pagamentosReais: [pg('Escritório responsável', 150, { responsavelPapel: 'ESCRITORIO', escritorioResponsavel: true })] })), CFG, HOJE);
    assert.strictEqual(r.destino, 'DEVE');
});
t('Pix Asaas RECEBIDO cobrindo = EM_ESPERA; Asaas estornado = DEVE', () => {
    const base = (rec) => conta([parc(100, 1)], ped({ dataEntrega: diasAtras(1), pagamentosReais: [pg('PIX Asaas', 100, { cobrancaAsaasId: 'x', asaasRecebido: rec })] }));
    assert.strictEqual(inad.classificarConta(base(true), CFG, HOJE).destino, 'EM_ESPERA');
    assert.strictEqual(inad.classificarConta(base(false), CFG, HOJE).destino, 'DEVE');
});
t('À vista - Funcionário = FORA/FUNCIONARIO (e volta a DEVE com a chave desligada)', () => {
    const c = conta([parc(90, 30)], ped({ nomeCondicaoPagamento: 'À vista - Funcionário', pagamentosReais: [pg('À vista - Funcionário', 90)] }));
    const r = inad.classificarConta(c, CFG, HOJE);
    assert.strictEqual(r.destino, 'FORA'); assert.strictEqual(r.motivo, 'FUNCIONARIO');
    assert.strictEqual(inad.classificarConta(c, { ...CFG, funcionarioFora: false }, HOJE).destino, 'DEVE');
});
t('Especial NÃO entregue = FORA; entregue = DEVE', () => {
    const p = (st) => conta([parc(350, 20)], ped({ especial: true, statusEntrega: st, pagamentosReais: [] }));
    const r = inad.classificarConta(p('PENDENTE'), CFG, HOJE);
    assert.strictEqual(r.destino, 'FORA'); assert.strictEqual(r.motivo, 'ESPECIAL_NAO_ENTREGUE');
    assert.strictEqual(inad.classificarConta(p('ENTREGUE'), CFG, HOJE).destino, 'DEVE');
});
t('Conta sem pedido (importada) = DEVE', () => {
    assert.strictEqual(inad.classificarConta(conta([parc(500, 40)], null), CFG, HOJE).destino, 'DEVE');
});
t('Parcela de R$ 0,10 vencida é ignorada (tolerância)', () => {
    const r = inad.classificarConta(conta([parc(0.10, 90)], ped()), CFG, HOJE);
    assert.strictEqual(r.vencidas.length, 0);
});
t('Parcela parcial: conta só o saldo que falta', () => {
    const r = inad.classificarConta(conta([parc(100, 10, { status: 'PARCIAL', valorPago: 60 })], ped()), CFG, HOJE);
    assert.strictEqual(r.vencidas[0].saldo, 40);
});

const vencH = (n, hora) => new Date(`${new Date(Date.parse(`${HOJE}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10)}T${hora}`);
t('vencida ontem às 12:00Z = 1 dia de atraso (não 0)', () => {
    const r = inad.classificarConta(conta([parc(100, 0, { dataVencimento: vencH(1, '12:00:00Z') })], ped()), CFG, HOJE);
    assert.strictEqual(r.vencidas.length, 1); assert.strictEqual(r.vencidas[0].diasAtraso, 1);
});
t('vencimento HOJE às 12:00Z / 23:59Z / 00:00Z NÃO está vencido', () => {
    for (const h of ['12:00:00Z', '23:59:00Z', '00:00:00Z']) {
        const r = inad.classificarConta(conta([parc(100, 0, { dataVencimento: vencH(0, h) })], ped()), CFG, HOJE);
        assert.strictEqual(r.vencidas.length, 0, h);
    }
});
t('mesmo dia de calendário = mesmos dias de atraso em 12:00Z, 23:59Z e 00:00Z (57)', () => {
    for (const h of ['12:00:00Z', '23:59:00Z', '00:00:00Z', '15:00:00Z']) {
        const r = inad.classificarConta(conta([parc(642.38, 0, { dataVencimento: vencH(57, h) })], ped()), CFG, HOJE);
        assert.strictEqual(r.vencidas[0].diasAtraso, 57, h);
    }
});
t('carência de 3 dias vale no 3º dia de atraso (vencida às 12:00Z), não depois', () => {
    const c = (d) => inad.agregar([conta([parc(200, 0, { dataVencimento: vencH(d, '12:00:00Z') })], ped())].map(x => ({ conta: x, r: inad.classificarConta(x, CFG, HOJE) })), CFG);
    assert.strictEqual(c(2).bloqueiaVenda, false); assert.strictEqual(c(3).bloqueiaVenda, true);
});
t('3 parcelas de R$ 0,90 na mesma conta não viram selo (soma <= R$ 1)', () => {
    const r = inad.classificarConta(conta([parc(0.9, 30), parc(0.9, 20, { numeroParcela: 2 }), parc(0.9, 10, { numeroParcela: 3 })], ped()), CFG, HOJE);
    assert.strictEqual(r.vencidas.length, 0);
});
t('idade do a-confirmar sem dataEntrega usa o pagamento MAIS ANTIGO', () => {
    const r = inad.classificarConta(conta([parc(100, 20)], ped({ dataEntrega: null, pagamentosReais: [pg('À vista - Pix', 60, { createdAt: diasAtras(20) }), pg('À vista - Pix', 40, { createdAt: diasAtras(0) })] })), CFG, HOJE);
    assert.strictEqual(r.destino, 'A_CONFIRMAR'); assert.strictEqual(r.aConfirmar.dias, 20);
});

console.log('agregar (selo e bloqueio)');
const agr = (contas) => inad.agregar(contas.map(c => ({ conta: c, r: inad.classificarConta(c, CFG, HOJE) })), CFG);
t('Gourmet: 3 boletos = R$ 1.247,08 inadimplente + bloqueia', () => {
    const s = agr([
        conta([parc(642.38, 57)], ped({ pagamentosReais: [pg('7 dias - Boleto', 642.38)] })),
        conta([parc(110, 50)], ped({ pagamentosReais: [pg('7 dias - Boleto', 110)] })),
        conta([parc(494.70, 29)], ped({ pagamentosReais: [pg('7 dias - Boleto', 494.70)] })),
    ]);
    assert.strictEqual(s.totalVencido, 1247.08); assert.strictEqual(s.parcelasVencidas, 3); assert.strictEqual(s.diasMaisAntiga, 57);
    assert.strictEqual(s.inadimplente, true); assert.strictEqual(s.bloqueiaVenda, true);
});
t('R$ 40 vencido há 2 dias: selo SIM, bloqueio NÃO (carência e mínimo)', () => {
    const s = agr([conta([parc(40, 2)], ped())]);
    assert.strictEqual(s.inadimplente, true); assert.strictEqual(s.bloqueiaVenda, false);
});
t('R$ 200 vencido há 1 dia: selo SIM, bloqueio NÃO (carência)', () => {
    const s = agr([conta([parc(200, 1)], ped())]);
    assert.strictEqual(s.inadimplente, true); assert.strictEqual(s.bloqueiaVenda, false);
});
t('R$ 200 vencido há 3 dias: bloqueia', () => {
    assert.strictEqual(agr([conta([parc(200, 3)], ped())]).bloqueiaVenda, true);
});
t('R$ 0,10 não é inadimplente', () => {
    assert.strictEqual(agr([conta([parc(0.10, 90)], ped())]).inadimplente, false);
});
t('a confirmar não bloqueia e não é inadimplente', () => {
    const s = agr([conta([parc(322.44, 46)], ped({ dataEntrega: diasAtras(46), pagamentosReais: [pg('À vista - Pix', 322.44)] }))]);
    assert.strictEqual(s.inadimplente, false); assert.strictEqual(s.bloqueiaVenda, false); assert.ok(s.aConfirmar && s.aConfirmar.valor === 322.44);
});

if (process.argv.includes('--hoje')) {
    try { rodarContraProducao(); } catch (e) {
        console.error('\nNão foi possível rodar a parte --hoje: precisa do psql local e do banco hardt_diag com o schema `hoje` (cópia de produção).');
        console.error('Detalhe:', String(e.message || e).split('\n')[0]);
        process.exitCode = 1;
    }
}
else console.log(`\n${ok} ok, ${falhas} falha(s)  (use --hoje para rodar contra a cópia de produção)`);

function rodarContraProducao() {
    console.log('\n=== Função pura contra o schema `hoje` (cópia de produção 14/10) — hoje =', HOJE, '===');
    const q = (sql) => JSON.parse(execSync(`psql hardt_diag -Atc ${JSON.stringify(`select coalesce(json_agg(t),'[]') from (${sql}) t`)}`, { maxBuffer: 1 << 28 }).toString());
    const contasDb = q("select cr.id, cr.cliente_id, cr.pedido_id from hoje.contas_receber cr where cr.status in ('ABERTO','PARCIAL')");
    const parcelasDb = q("select id, conta_receber_id, numero_parcela, valor, valor_pago, valor_desconto_total, status, data_vencimento from hoje.parcelas");
    const pedidosDb = q("select id, numero, especial, status_entrega, data_entrega, nome_condicao_pagamento, status_envio, situacao_ca from hoje.pedidos");
    const pagDb = q("select pedido_id, forma_pagamento_nome, valor, cobranca_asaas_id, created_at, responsavel_papel, escritorio_responsavel, vendedor_responsavel_id from hoje.pedido_pagamentos_reais");
    const clientesDb = q('select "UUID" as id, "Nome" as nome, "NomeFantasia" as fantasia from hoje.clientes');
    const nomeCli = Object.fromEntries(clientesDb.map(c => [c.id, c.fantasia || c.nome]));
    const d = (s) => (s ? new Date(String(s).replace(' ', 'T') + (String(s).length <= 10 ? 'T00:00:00Z' : 'Z')) : null);
    const parcPorConta = {}; for (const p of parcelasDb) (parcPorConta[p.conta_receber_id] ||= []).push({ id: p.id, numeroParcela: Number(p.numero_parcela), valor: Number(p.valor), valorPago: Number(p.valor_pago || 0), valorDescontoTotal: Number(p.valor_desconto_total || 0), status: p.status, dataVencimento: new Date(String(p.data_vencimento).slice(0, 10) + 'T00:00:00Z') });
    const pagPorPed = {}; for (const g of pagDb) (pagPorPed[g.pedido_id] ||= []).push({ formaPagamentoNome: g.forma_pagamento_nome, valor: Number(g.valor), cobrancaAsaasId: g.cobranca_asaas_id, asaasRecebido: !/estornad/i.test(g.forma_pagamento_nome), createdAt: d(g.created_at), responsavelPapel: g.responsavel_papel || null, escritorioResponsavel: g.escritorio_responsavel === 't', vendedorResponsavelId: g.vendedor_responsavel_id || null });
    const pedMap = Object.fromEntries(pedidosDb.map(p => [p.id, p]));

    const contas = [];
    for (const c of contasDb) {
        let pedido = null;
        if (c.pedido_id) {
            const p = pedMap[c.pedido_id];
            if (!p || p.status_envio === 'EXCLUIDO' || p.situacao_ca === 'CANCELADO') continue; // mesmo filtro do carregarContas
            pedido = { numero: p.numero, especial: p.especial === 't', statusEntrega: p.status_entrega, dataEntrega: d(p.data_entrega), nomeCondicaoPagamento: p.nome_condicao_pagamento, pagamentosReais: pagPorPed[p.id] || [] };
        }
        contas.push({ id: c.id, clienteId: c.cliente_id, parcelas: parcPorConta[c.id] || [], pedido });
    }
    const hoje = new Date(`${HOJE}T00:00:00Z`);
    const vencida = (p) => ['PENDENTE', 'PARCIAL', 'VENCIDO'].includes(p.status) && p.dataVencimento < hoje;

    // ANTIGO: legado (contasAguardandoConferencia), sem tolerância e sem recorte
    const emEsperaAntigo = contasAguardandoConferencia(contas);
    const antigo = {};
    for (const c of contas) { if (emEsperaAntigo.has(c.id)) continue; for (const p of c.parcelas) if (vencida(p)) antigo[c.clienteId] = (antigo[c.clienteId] || 0) + p.valor - p.valorPago - p.valorDescontoTotal; }
    for (const k of Object.keys(antigo)) if (antigo[k] <= 0.01) delete antigo[k];

    // NOVO
    const porCli = {}, destinos = {};
    for (const c of contas) {
        const r = inad.classificarConta(c, CFG, HOJE);
        (porCli[c.clienteId] ||= []).push({ conta: c, r });
        const k = r.destino + (r.motivo ? '/' + r.motivo : ''); destinos[k] = (destinos[k] || 0) + 1;
    }
    const novo = {}; for (const [cid, l] of Object.entries(porCli)) novo[cid] = inad.agregar(l, CFG);
    const verm = Object.entries(novo).filter(([, s]) => s.inadimplente);
    const bloq = verm.filter(([, s]) => s.bloqueiaVenda);
    const amar = Object.entries(novo).filter(([, s]) => s.aConfirmar);
    const soma = (a) => Math.round(a.reduce((s, v) => s + v, 0) * 100) / 100;
    console.log('contas abertas analisadas:', contas.length, '| por destino:', JSON.stringify(destinos));
    console.log(`ANTIGO: ${Object.keys(antigo).length} clientes vermelhos, R$ ${soma(Object.values(antigo))}`);
    console.log(`NOVO  : ${verm.length} clientes DEVE (selo vermelho), R$ ${soma(verm.map(([, s]) => s.totalVencido))}`);
    console.log(`        ${bloq.length} bloqueiam venda (carência ${CFG.carenciaDias}d + mín R$ ${CFG.valorMinimoBloqueio}), R$ ${soma(bloq.map(([, s]) => s.totalVencido))}`);
    console.log(`        ${amar.length} A CONFIRMAR (amarelo), R$ ${soma(amar.map(([, s]) => s.aConfirmar.valor))}`);
    const vSet = new Set(verm.map(([id]) => id));
    const apareceram = verm.filter(([id]) => !antigo[id]), sumiram = Object.keys(antigo).filter(id => !vSet.has(id));
    console.log(`\nAPARECERAM (${apareceram.length}):`); apareceram.sort((a, b) => b[1].totalVencido - a[1].totalVencido).forEach(([id, s]) => console.log(`  ${nomeCli[id]}  R$ ${s.totalVencido}  ${s.diasMaisAntiga}d  bloqueia=${s.bloqueiaVenda}`));
    console.log(`SUMIRAM (${sumiram.length}):`); sumiram.forEach(id => console.log(`  ${nomeCli[id]}  antes R$ ${Math.round(antigo[id] * 100) / 100}  -> ${JSON.stringify(novo[id] ? { ...novo[id] } : 'sem conta ativa')}`));
    console.log('A CONFIRMAR:'); amar.forEach(([id, s]) => console.log(`  ${nomeCli[id]}  ${JSON.stringify(s.aConfirmar)}`));

    console.log('\nCasos que o cálculo TEM que acertar:');
    const porNome = (frag) => Object.keys(porCli).filter(id => (nomeCli[id] || '').toUpperCase().includes(frag.toUpperCase()));
    const chk = (nome, cond, info) => { (cond ? ok++ : falhas++); console.log(`  ${cond ? 'ok   ' : 'FALHA'} ${nome}  ${info || ''}`); };
    const g = novo['a1180ff4-a376-4789-9673-57ba9c9c9180'];
    chk('Gourmet Lanches: DEVE R$ 1.247,08', g && g.inadimplente && g.totalVencido === 1247.08, JSON.stringify(g));
    const dai = novo['8767c5b6-af89-4ad5-b852-6252e6956daa'];
    chk('Panificadora Daiane: A_CONFIRMAR (Pix 322,44), não DEVE', dai && !dai.inadimplente && dai.aConfirmar && dai.aConfirmar.valor === 322.44, JSON.stringify(dai));
    const gab = novo['357298f9-fd62-4efe-aa98-b844a92f2ef8'];
    chk('Gabriela Moraes dos Navegantes (especial não entregue): FORA', !gab || !gab.inadimplente, JSON.stringify(gab));
    const funcs = contas.filter(c => c.pedido && /funcion/i.test(c.pedido.nomeCondicaoPagamento || '') || (c.pedido?.pagamentosReais || []).some(p => /funcion/i.test(p.formaPagamentoNome)));
    const funcFalhou = funcs.filter(c => inad.classificarConta(c, CFG, HOJE).destino !== 'FORA');
    chk(`todas as ${funcs.length} contas abertas de funcionário = FORA`, funcFalhou.length === 0, funcFalhou.length ? `${funcFalhou.length} falharam` : '');
    console.log(`\n${ok} ok, ${falhas} falha(s)`);
    process.exitCode = falhas ? 1 : 0;
}
if (!process.argv.includes('--hoje')) process.exitCode = falhas ? 1 : 0;
