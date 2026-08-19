/**
 * Teste da baixa de PEDIDO ESPECIAL contra o banco LOCAL, exercitando as rotas de
 * verdade (entregas → caixa → contas a receber) montadas num express de teste.
 *
 * Prova:
 *   1. entrega de especial recebendo tudo em dinheiro NÃO baixa mais o título
 *      (só registra o pagamento) — a baixa automática foi removida;
 *   2. a baixa no Caixa quita: parcela PAGO, UMA linha de ledger, conta = Caixinha,
 *      autor = usuário que operou o caixa;
 *   3. recebendo menos que o valor, a parcela fica PARCIAL com saldo em aberto;
 *   4. rodar a baixa duas vezes não duplica ledger nem valor;
 *   5. estorno devolve a parcela ao valor cheio e marca o ledger como estornado;
 *   6. pedido do CA (não especial) continua igual (sem regressão);
 *   8. forma não permitida pela condição do pedido é recusada com mensagem clara.
 *
 * Cria e APAGA os próprios dados (prefixo TESTE-BXESP).
 * ⛔ SÓ RODA NO BANCO LOCAL (trava em exigir-banco-local.js).
 *
 * Rodar: node backend/scripts/teste-baixa-especial-ledger.js
 */
require('dotenv').config();
require('./exigir-banco-local')('teste-baixa-especial-ledger.js');

const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../config/database');
const JWT_SECRET = require('../config/jwtSecret');

const MARCA = `TESTE-BXESP-${Date.now()}`;
const num = (v) => Number(v || 0);
const round2 = (v) => Math.round(num(v) * 100) / 100;
let falhas = 0;
const ok = (rotulo, cond, extra = '') => {
    console.log(`  ${cond ? '✅' : '❌'} ${rotulo}${extra ? ` — ${extra}` : ''}`);
    if (!cond) falhas++;
};

let servidor, base, token, usuarioCaixa, motorista, cliente, produto, caixinhaId, vendedorComum, tokenVend;
// clientes isolados: a ficha de inadimplência soma TODOS os títulos do cliente, então os
// testes de bloqueio de venda precisam de clientes que só tenham o título do próprio caso
let clienteEspera, clienteParcial;
const criados = { pedidos: [], contas: [], embarques: [] };

async function subirServidor() {
    const app = express();
    app.use(express.json());
    app.use('/api/entregas', require('../routes/entregas'));
    app.use('/api/caixa', require('../routes/caixa'));
    app.use('/api/contas-receber', require('../routes/contasReceber'));
    app.use('/api/cobrancas-rota', require('../routes/cobrancasRota'));
    // Sem segredo default: teste que grava/valida rota protegida falha fechado.
    if (!process.env.ADMIN_SECRET) {
        throw new Error('Defina ADMIN_SECRET no ambiente para rodar este teste (ex.: ADMIN_SECRET=xxx JWT_SECRET=yyy node ...).');
    }
    app.use('/api/admin-exec', require('../routes/adminExec'));
    app.use('/api/pedidos', require('../middlewares/authMiddleware'), require('../routes/pedidoRoutes'));
    app.use('/api/clientes', require('../middlewares/authMiddleware'), require('../routes/clienteRoutes'));
    app.use('/api/devolucoes', require('../middlewares/authMiddleware'), require('../routes/devolucaoRoutes'));
    app.use('/api/admin-dashboard', require('../routes/adminDashboard'));
    await new Promise((r) => { servidor = app.listen(0, r); });
    base = `http://127.0.0.1:${servidor.address().port}`;
}

const api = async (metodo, rota, corpo, tk = token) => {
    const res = await fetch(base + rota, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
        body: corpo ? JSON.stringify(corpo) : undefined
    });
    let json = null;
    try { json = await res.json(); } catch (_) { }
    return { status: res.status, body: json };
};

async function seedBase() {
    produto = await prisma.produto.findFirst({ where: { ativo: true } });
    if (!produto) throw new Error('Nenhum produto no banco local — rode um seed antes.');

    const caixinha = await prisma.contaFinanceira.findFirst({ where: { tipoUso: 'DINHEIRO', ativo: true } });
    caixinhaId = caixinha?.id || null;
    console.log(`  Caixinha (tipoUso DINHEIRO): ${caixinha?.nomeBanco} / ${caixinhaId}`);

    usuarioCaixa = await prisma.vendedor.create({
        data: {
            id: `${MARCA}-CX`, nome: `${MARCA} Operador Caixa`,
            // pedidos.clientes = 'todos': a listagem de clientes só mostra todos com isso
            permissoes: { admin: true, pedidos: { clientes: 'todos' } }
        }
    });
    motorista = await prisma.vendedor.create({
        data: { id: `${MARCA}-MOT`, nome: `${MARCA} Motorista`, permissoes: { admin: true } }
    });
    cliente = await prisma.cliente.create({
        data: {
            UUID: `${MARCA}-CLI`, Nome: `${MARCA} Cliente`, NomeFantasia: `${MARCA} Cliente`,
            // condição liberada, senão a criação de pedido do teste 11 para na validação de condição
            Condicao_de_pagamento: 'AVISTA_DIN'
        }
    });
    clienteEspera = await prisma.cliente.create({
        data: { UUID: `${MARCA}-CLI2`, Nome: `${MARCA} Cliente Espera`, NomeFantasia: `${MARCA} Cliente Espera`, Condicao_de_pagamento: 'AVISTA_DIN' }
    });
    clienteParcial = await prisma.cliente.create({
        data: { UUID: `${MARCA}-CLI3`, Nome: `${MARCA} Cliente Parcial`, NomeFantasia: `${MARCA} Cliente Parcial`, Condicao_de_pagamento: 'AVISTA_DIN' }
    });
    token = jwt.sign({ id: usuarioCaixa.id, nome: usuarioCaixa.nome }, JWT_SECRET, { expiresIn: '1h' });
}

async function criarPedido({ valor, especial = true, condicao, bonificacao = false, faturado = false, clienteUuid = null, responsavelId = null }) {
    const uuidCliente = clienteUuid || cliente.UUID;
    // responsavelId: permite isolar um dia de caixa em outro motorista (teste 33)
    const idResponsavel = responsavelId || motorista.id;
    const embarque = await prisma.embarque.create({
        data: { dataSaida: new Date(), responsavelId: idResponsavel }
    });
    criados.embarques.push(embarque.id);
    const pedido = await prisma.pedido.create({
        data: {
            dataVenda: new Date(),
            clienteId: uuidCliente,
            vendedorId: idResponsavel,
            especial,
            bonificacao,
            ...(faturado ? { statusEnvio: 'RECEBIDO', situacaoCA: 'FATURADO' } : {}),
            embarqueId: embarque.id,
            statusEntrega: 'PENDENTE',
            tipoPagamento: condicao.tipoPagamento,
            opcaoCondicaoPagamento: condicao.opcaoCondicao,
            nomeCondicaoPagamento: condicao.nomeCondicao,
            primeiroVencimento: new Date(),
            itens: { create: [{ produtoId: produto.id, quantidade: 1, valor, valorBase: valor }] }
        }
    });
    criados.pedidos.push(pedido.id);
    const conta = await prisma.contaReceber.create({
        data: {
            pedidoId: pedido.id,
            clienteId: uuidCliente,
            origem: especial ? 'ESPECIAL' : 'FATURADO_CA',
            valorTotal: valor,
            status: 'ABERTO',
            parcelas: { create: [{ numeroParcela: 1, valor, dataVencimento: new Date(), status: 'PENDENTE' }] }
        },
        include: { parcelas: true }
    });
    criados.contas.push(conta.id);
    return { pedido, conta };
}

const estado = async (contaId) => prisma.contaReceber.findUnique({
    where: { id: contaId },
    include: { parcelas: { include: { pagamentos: true } } }
});

async function main() {
    console.log(`\n=== ${MARCA} ===`);
    await subirServidor();
    await seedBase();

    const condDinheiro = await prisma.tabelaPreco.findFirst({
        where: { ativo: true, permiteEspecial: true, nomeCondicao: 'À vista - Dinheiro' }
    });
    if (!condDinheiro) throw new Error('Condição "À vista - Dinheiro" não encontrada no banco local.');
    const FORMA_OK = condDinheiro.nomeCondicao; // é a própria condição (tabela_AVISTA_DIN)

    // ── TESTE 1: entrega de especial R$ 300 em dinheiro → título continua ABERTO ──
    console.log('\n[1] Entrega de especial R$ 300 em dinheiro (não pode mais baixar sozinha)');
    const t1 = await criarPedido({ valor: 300, condicao: condDinheiro });
    const motoristaToken = jwt.sign({ id: motorista.id, nome: motorista.nome }, JWT_SECRET, { expiresIn: '1h' });
    const r1 = await api('POST', `/api/entregas/${t1.pedido.id}/concluir`, {
        statusEntrega: 'ENTREGUE',
        pagamentos: [{ formaPagamentoNome: FORMA_OK, valor: 300 }]
    }, motoristaToken);
    ok('entrega aceita', r1.status === 200, JSON.stringify(r1.body));
    const e1 = await estado(t1.conta.id);
    const pgtosReais = await prisma.pedidoPagamentoReal.findMany({ where: { pedidoId: t1.pedido.id } });
    ok('conta continua ABERTO', e1.status === 'ABERTO', `status=${e1.status}`);
    ok('parcela continua PENDENTE', e1.parcelas[0].status === 'PENDENTE', `status=${e1.parcelas[0].status}`);
    ok('nenhum ledger criado na entrega', e1.parcelas[0].pagamentos.length === 0);
    ok('pagamento da entrega registrado (base do "a prestar")',
        pgtosReais.length === 1 && num(pgtosReais[0].valor) === 300, `R$ ${num(pgtosReais[0]?.valor)}`);

    // ── TESTE 2: baixa no caixa → PAGO + 1 ledger + Caixinha + autor do caixa ──
    console.log('\n[2] Baixa no Caixa (quem confere é o autor)');
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    // Meio-dia do dia do caixa: o resumo casa entrega x caixa por dataEntrega dentro da
    // janela UTC do dia (entrega lançada depois das 21h SP cai no caixa do dia seguinte).
    const dataEntregaTeste = new Date(hoje + 'T12:00:00-03:00');
    const r2 = await api('POST', '/api/caixa/quitar-ca', { pedidoIds: [t1.pedido.id], dataPagamento: hoje });
    ok('rota respondeu 200', r2.status === 200, JSON.stringify(r2.body).slice(0, 300));
    const e2 = await estado(t1.conta.id);
    const led2 = e2.parcelas[0].pagamentos;
    ok('parcela PAGO', e2.parcelas[0].status === 'PAGO', `status=${e2.parcelas[0].status}`);
    ok('conta QUITADO', e2.status === 'QUITADO', `status=${e2.status}`);
    ok('UMA linha de ledger de R$ 300', led2.length === 1 && num(led2[0].valorRecebido) === 300,
        `${led2.length} linha(s) / R$ ${num(led2[0]?.valorRecebido)}`);
    ok('ledger na Caixinha', led2[0]?.contaFinanceiraCaId === caixinhaId, `conta=${led2[0]?.contaFinanceiraCaId}`);
    ok('autor = operador do caixa', led2[0]?.registradoPorId === usuarioCaixa.id, `autor=${led2[0]?.registradoPorId}`);
    ok('parcela baixada pelo operador do caixa', e2.parcelas[0].baixadoPorId === usuarioCaixa.id);
    ok('caixaDiarioId null (dinheiro presta pela conferência da tabela do motorista)',
        led2[0]?.caixaDiarioId === null);
    const res2 = r2.body?.resultados?.[0];
    ok('baixa total: parcial=false e saldoRestante=0',
        res2?.parcial === false && num(res2?.saldoRestante) === 0,
        JSON.stringify({ parcial: res2?.parcial, saldoRestante: res2?.saldoRestante }));

    // ── TESTE 4: rodar a mesma baixa de novo → não duplica ──
    console.log('\n[4] Rodar a mesma baixa duas vezes');
    const r4 = await api('POST', '/api/caixa/quitar-ca', { pedidoIds: [t1.pedido.id], dataPagamento: hoje });
    const e4 = await estado(t1.conta.id);
    ok('2ª execução não cria ledger novo', e4.parcelas[0].pagamentos.length === 1,
        `${e4.parcelas[0].pagamentos.length} linha(s)`);
    ok('valor pago segue R$ 300', num(e4.parcelas[0].valorPago) === 300, `R$ ${num(e4.parcelas[0].valorPago)}`);
    ok('resultado avisa que já estava baixado',
        r4.body?.resultados?.[0]?.status === 'JA_QUITADO', JSON.stringify(r4.body?.resultados?.[0]));

    // ── TESTE 3: recebeu menos → PARCIAL com saldo em aberto ──
    console.log('\n[3] Especial de R$ 300 recebendo R$ 200');
    const t3 = await criarPedido({ valor: 300, condicao: condDinheiro });
    await prisma.pedidoPagamentoReal.create({
        data: { pedidoId: t3.pedido.id, formaPagamentoNome: FORMA_OK, valor: 200 }
    });
    await prisma.pedido.update({ where: { id: t3.pedido.id }, data: { statusEntrega: 'ENTREGUE', dataEntrega: dataEntregaTeste } });
    const r3 = await api('POST', '/api/caixa/quitar-ca', { pedidoIds: [t3.pedido.id], dataPagamento: hoje });
    const e3 = await estado(t3.conta.id);
    const led3 = e3.parcelas[0].pagamentos;
    ok('rota 200', r3.status === 200, JSON.stringify(r3.body?.resultados?.[0] || r3.body).slice(0, 200));
    ok('parcela PARCIAL', e3.parcelas[0].status === 'PARCIAL', `status=${e3.parcelas[0].status}`);
    ok('conta PARCIAL', e3.status === 'PARCIAL', `status=${e3.status}`);
    ok('ledger de R$ 200', led3.length === 1 && num(led3[0].valorRecebido) === 200, `R$ ${num(led3[0]?.valorRecebido)}`);
    ok('saldo de R$ 100 em aberto',
        num(e3.parcelas[0].valor) - num(e3.parcelas[0].valorPago) === 100,
        `saldo R$ ${num(e3.parcelas[0].valor) - num(e3.parcelas[0].valorPago)}`);
    const res3 = r3.body?.resultados?.[0];
    ok('resultado diz parcial: true (dado, não texto)', res3?.parcial === true, JSON.stringify(res3?.parcial));
    ok('resultado traz saldoRestante = 100', Math.abs(num(res3?.saldoRestante) - 100) < 0.01, `${res3?.saldoRestante}`);
    ok('detalhes vem como ARRAY de strings',
        Array.isArray(res3?.detalhes) && res3.detalhes.every(d => typeof d === 'string') && res3.detalhes.length > 0,
        JSON.stringify(res3?.detalhes));
    ok('detalhe (string) mantido para quem já lia assim',
        typeof res3?.detalhe === 'string' && res3.detalhe === res3.detalhes.join(' | '));

    // ── TESTE 4b: repetir a baixa de um título PARCIAL não soma de novo ──
    console.log('\n[4b] Repetir a baixa do título PARCIAL (trava de idempotência do ledger)');
    await api('POST', '/api/caixa/quitar-ca', { pedidoIds: [t3.pedido.id], dataPagamento: hoje });
    const e4b = await estado(t3.conta.id);
    ok('continua com 1 linha de ledger', e4b.parcelas[0].pagamentos.length === 1,
        `${e4b.parcelas[0].pagamentos.length} linha(s)`);
    ok('valor pago segue R$ 200', num(e4b.parcelas[0].valorPago) === 200, `R$ ${num(e4b.parcelas[0].valorPago)}`);
    ok('parcela segue PARCIAL', e4b.parcelas[0].status === 'PARCIAL');

    // ── TESTE 5: estorno da baixa ──
    console.log('\n[5] Estorno da baixa (DELETE /contas-receber/:parcelaId/baixa)');
    const r5 = await api('DELETE', `/api/contas-receber/${e2.parcelas[0].id}/baixa`);
    const e5 = await estado(t1.conta.id);
    const led5 = await prisma.pagamentoParcela.findMany({ where: { parcelaId: e2.parcelas[0].id } });
    ok('rota 200', r5.status === 200, JSON.stringify(r5.body));
    ok('ledger marcado como estornado', led5.every(l => l.estornado), JSON.stringify(led5.map(l => l.estornado)));
    ok('parcela volta a PENDENTE com valor cheio',
        e5.parcelas[0].status === 'PENDENTE' && e5.parcelas[0].valorPago === null,
        `status=${e5.parcelas[0].status} pago=${e5.parcelas[0].valorPago}`);
    ok('conta volta a ABERTO', e5.status === 'ABERTO', `status=${e5.status}`);
    // Depois do estorno a baixa pode ser refeita (a marca de idempotência só conta ledger vivo)
    const r5b = await api('POST', '/api/caixa/quitar-ca', { pedidoIds: [t1.pedido.id], dataPagamento: hoje });
    const e5b = await estado(t1.conta.id);
    ok('baixa pode ser refeita após o estorno',
        e5b.parcelas[0].status === 'PAGO' && e5b.parcelas[0].pagamentos.filter(p => !p.estornado).length === 1,
        `status=${e5b.parcelas[0].status}`);

    // ── TESTE 5b: reverter-quitacao também estorna o ledger (cascata) ──
    console.log('\n[5b] PUT /contas-receber/:id/reverter-quitacao (cascata)');
    const r5c = await api('PUT', `/api/contas-receber/${t1.conta.id}/reverter-quitacao`);
    const e5c = await estado(t1.conta.id);
    const led5c = await prisma.pagamentoParcela.findMany({ where: { parcelaId: e5c.parcelas[0].id } });
    ok('rota 200', r5c.status === 200, JSON.stringify(r5c.body));
    ok('nenhum ledger vivo sobrou', led5c.every(l => l.estornado), JSON.stringify(led5c.map(l => l.estornado)));
    ok('parcela PENDENTE e conta ABERTO',
        e5c.parcelas[0].status === 'PENDENTE' && e5c.status === 'ABERTO',
        `${e5c.parcelas[0].status}/${e5c.status}`);

    // ── TESTE 8: forma não permitida pela condição ──
    console.log('\n[8] Baixa com forma NÃO permitida pela condição');
    const t8 = await criarPedido({ valor: 150, condicao: condDinheiro });
    await prisma.pedidoPagamentoReal.create({
        data: { pedidoId: t8.pedido.id, formaPagamentoNome: 'Dinheiro do bolso', valor: 150 }
    });
    await prisma.pedido.update({ where: { id: t8.pedido.id }, data: { statusEntrega: 'ENTREGUE', dataEntrega: dataEntregaTeste } });
    const r8 = await api('POST', '/api/caixa/quitar-ca', { pedidoIds: [t8.pedido.id], dataPagamento: hoje });
    const res8 = r8.body?.resultados?.[0];
    const e8 = await estado(t8.conta.id);
    ok('baixa recusada', res8?.status === 'ERRO', JSON.stringify(res8));
    ok('mensagem diz o que fazer', /não é permitida|Liberadas|Corrija/.test(res8?.erro || ''), res8?.erro);
    ok('título continua aberto e sem ledger',
        e8.status === 'ABERTO' && e8.parcelas[0].pagamentos.length === 0);

    // ── TESTE 6: pedido do CA (não especial) — sem regressão ──
    console.log('\n[6] Pedido CA (não especial) — comportamento inalterado');
    const t6 = await criarPedido({ valor: 300, especial: false, condicao: condDinheiro });
    await prisma.pedidoPagamentoReal.create({
        data: { pedidoId: t6.pedido.id, formaPagamentoNome: FORMA_OK, valor: 300 }
    });
    await prisma.pedido.update({ where: { id: t6.pedido.id }, data: { statusEntrega: 'ENTREGUE', dataEntrega: dataEntregaTeste } });
    const r6 = await api('POST', '/api/caixa/quitar-ca', { pedidoIds: [t6.pedido.id], dataPagamento: hoje });
    const e6 = await estado(t6.conta.id);
    const led6 = e6.parcelas[0].pagamentos;
    const ped6 = await prisma.pedido.findUnique({ where: { id: t6.pedido.id }, select: { baixaCaRealizada: true, baixaCaValor: true } });
    ok('rota 200', r6.status === 200, JSON.stringify(r6.body?.resultados?.[0] || r6.body).slice(0, 200));
    ok('parcela PAGO com 1 ledger', e6.parcelas[0].status === 'PAGO' && led6.length === 1,
        `${e6.parcelas[0].status} / ${led6.length} linha(s)`);
    ok('origem CAIXA_BAIXA_CA', led6[0]?.origem === 'CAIXA_BAIXA_CA', `origem=${led6[0]?.origem}`);
    ok('pedido marcado com baixaCaRealizada', ped6.baixaCaRealizada === true && num(ped6.baixaCaValor) === 300);
    const res6 = r6.body?.resultados?.[0];
    ok('ramo CA usa o mesmo contrato (parcial/saldoRestante/detalhes)',
        res6?.parcial === false && num(res6?.saldoRestante) === 0 && Array.isArray(res6?.detalhes),
        JSON.stringify({ parcial: res6?.parcial, saldoRestante: res6?.saldoRestante, detalhes: res6?.detalhes }));


    // ── TESTE 16: forma "Vendedor responsável" não quita (sem banco não quita) ──
    console.log('\n[16] Baixa no caixa com "Vendedor responsável" (responsável não quita)');
    const t16 = await criarPedido({ valor: 400, condicao: condDinheiro });
    await prisma.pedidoPagamentoReal.create({
        data: { pedidoId: t16.pedido.id, formaPagamentoNome: 'Vendedor responsável', valor: 400, vendedorResponsavelId: motorista.id }
    });
    await prisma.pedido.update({ where: { id: t16.pedido.id }, data: { statusEntrega: 'ENTREGUE', dataEntrega: dataEntregaTeste } });
    const r16 = await api('POST', '/api/caixa/quitar-ca', { pedidoIds: [t16.pedido.id], dataPagamento: hoje });
    const e16 = await estado(t16.conta.id);
    const res16 = r16.body?.resultados?.[0];
    ok('não gerou ledger', e16.parcelas[0].pagamentos.length === 0);
    ok('parcela PENDENTE com valor cheio',
        e16.parcelas[0].status === 'PENDENTE' && e16.parcelas[0].valorPago === null,
        `${e16.parcelas[0].status}/${e16.parcelas[0].valorPago}`);
    ok('conta continua ABERTO', e16.status === 'ABERTO');
    ok('resultado avisa que a cobrança ficou com o responsável',
        /respons|em aberto/i.test(`${res16?.erro || ''}${res16?.detalhe || ''}`), JSON.stringify(res16));
    ok('SEM_BAIXA traz parcial=false e saldoRestante com o valor em aberto',
        res16?.parcial === false && Math.abs(num(res16?.saldoRestante) - 400) < 0.01,
        JSON.stringify({ parcial: res16?.parcial, saldoRestante: res16?.saldoRestante }));
    ok('detalhes é array também no SEM_BAIXA', Array.isArray(res16?.detalhes), JSON.stringify(res16?.detalhes));
    ok('message do resumo conta o SEM_BAIXA',
        /1 sem baixa/.test(r16.body?.message || '') && r16.body?.resumo?.semBaixa === 1,
        `${r16.body?.message} | resumo=${JSON.stringify(r16.body?.resumo)}`);

    // ── TESTE 17: baixa manual com forma "responsável" é recusada ──
    console.log('\n[17] Baixa manual em Contas a Receber com forma "responsável"');
    const r17 = await api('POST', `/api/contas-receber/${e16.parcelas[0].id}/baixa`, {
        valorRecebido: 400, formaPagamento: 'Escritório responsável', dataPagamento: hoje
    });
    const e17 = await estado(t16.conta.id);
    ok('recusada com 400', r17.status === 400, JSON.stringify(r17.body));
    ok('mensagem explica que não quita', /não quita|respons/i.test(r17.body?.error || ''), r17.body?.error);
    ok('título continua aberto e sem ledger',
        e17.status === 'ABERTO' && e17.parcelas[0].pagamentos.length === 0);
    // bug de produção: a tela antiga manda `valorPago`; a rota lia só `valorRecebido`
    const r17b = await api('POST', `/api/contas-receber/${e16.parcelas[0].id}/baixa`, {
        valorPago: 400, formaPagamento: 'Dinheiro', dataPagamento: hoje
    });
    const e17b = await estado(t16.conta.id);
    ok('baixa manual aceita o campo LEGADO valorPago (não dá mais 400)',
        r17b.status === 200, `${r17b.status} ${JSON.stringify(r17b.body).slice(0, 160)}`);
    ok('parcela quitada com R$ 400 e uma linha de ledger',
        e17b.parcelas[0].status === 'PAGO' && num(e17b.parcelas[0].valorPago) === 400
        && e17b.parcelas[0].pagamentos.filter(l => !l.estornado).length === 1,
        `${e17b.parcelas[0].status} / R$ ${num(e17b.parcelas[0].valorPago)}`);
    // desfaz para não contaminar os testes seguintes (t16 é usado no 12 e no 14)
    await api('DELETE', `/api/contas-receber/${e16.parcelas[0].id}/baixa`);

    // ── TESTE 18: "responsável" fora dos totais do caixa e do "a prestar" ──
    console.log('\n[18] "Responsável" no resumo do caixa');
    const t18 = await criarPedido({ valor: 250, condicao: condDinheiro });
    await prisma.pedidoPagamentoReal.create({
        data: { pedidoId: t18.pedido.id, formaPagamentoNome: 'Escritório responsável', valor: 250, escritorioResponsavel: true }
    });
    await prisma.pedido.update({ where: { id: t18.pedido.id }, data: { statusEntrega: 'ENTREGUE', dataEntrega: dataEntregaTeste } });
    const r18 = await api('GET', `/api/caixa/resumo?data=${hoje}&vendedorId=${motorista.id}`);
    const linha18 = (r18.body?.entregas || []).find(e => e.pedidoId === t18.pedido.id);
    const linha16 = (r18.body?.entregas || []).find(e => e.pedidoId === t16.pedido.id);
    ok('resumo carregou', r18.status === 200 && !!linha18,
        `status=${r18.status} chaves=${Object.keys(r18.body || {}).join(',')} entregas=${(r18.body?.entregas || []).length}`);
    ok('escritório responsável NÃO debita o caixa do motorista',
        linha18?.pagamentos?.every(p => p.debitaCaixa === false), JSON.stringify(linha18?.pagamentos));
    ok('escritório/vendedor responsável não geram ledger vivo nenhum',
        (await prisma.pagamentoParcela.count({
            where: { estornado: false, parcela: { contaReceber: { pedidoId: { in: [t16.pedido.id, t18.pedido.id] } } } }
        })) === 0);
    console.log(`     (comportamento pré-existente do caixa: "Vendedor responsável" DEBITA o caixa =`
        + ` ${JSON.stringify(linha16?.pagamentos?.map(p => p.debitaCaixa))} — só registro, sem ledger)`);

    // ── TESTE 11: quem pagou e aguarda conferência não é inadimplente ──
    console.log('\n[11] Cliente com especial pago aguardando conferência consegue comprar');
    const t11 = await criarPedido({ valor: 500, condicao: condDinheiro, clienteUuid: clienteEspera.UUID });
    await prisma.pedidoPagamentoReal.create({
        data: { pedidoId: t11.pedido.id, formaPagamentoNome: FORMA_OK, valor: 500 }
    });
    await prisma.pedido.update({ where: { id: t11.pedido.id }, data: { statusEntrega: 'ENTREGUE', dataEntrega: dataEntregaTeste } });
    await prisma.parcela.updateMany({
        where: { contaReceberId: t11.conta.id },
        data: { dataVencimento: new Date(Date.now() - 5 * 86400000) }
    });
    // Prova ponta a ponta: vendedor SEM admin e SEM Pode_Vender_Inadimplente tenta
    // criar um pedido normal para esse cliente. Antes da correção, o especial vencido
    // (já pago em dinheiro na entrega) bloquearia a venda.
    vendedorComum = await prisma.vendedor.create({
        data: { id: `${MARCA}-VEND`, nome: `${MARCA} Vendedor`, permissoes: {} }
    });
    tokenVend = jwt.sign({ id: vendedorComum.id, nome: vendedorComum.nome }, JWT_SECRET, { expiresIn: '1h' });
    const novoPedido = await api('POST', '/api/pedidos', {
        clienteId: clienteEspera.UUID,
        vendedorId: vendedorComum.id,
        dataVenda: new Date(Date.now() + 7 * 86400000).toISOString(), // +7d: foge da trava de horário-limite
        statusEnvio: 'ABERTO',
        tipoPagamento: condDinheiro.tipoPagamento,
        opcaoCondicaoPagamento: condDinheiro.opcaoCondicao,
        nomeCondicaoPagamento: condDinheiro.nomeCondicao,
        itens: [{ produtoId: produto.id, quantidade: 1, valor: 50, valorBase: 50 }]
    }, tokenVend);
    if (novoPedido.body?.id) criados.pedidos.push(novoPedido.body.id);
    ok('venda nova permitida', novoPedido.status === 201, `${novoPedido.status} ${JSON.stringify(novoPedido.body).slice(0, 160)}`);
    // à vista é liberada mesmo com atraso, mas carimba o responsável na observação:
    // se o carimbo NÃO aparece, é prova de que nada foi considerado em atraso
    ok('não foi tratado como inadimplente (sem carimbo de atraso na observação)',
        !/atraso/i.test(novoPedido.body?.observacoes || ''), novoPedido.body?.observacoes || '(sem observação)');
    const fichaEspera = await api('GET', `/api/clientes/${clienteEspera.UUID}/inadimplencia`);
    ok('ficha do cliente não mostra atraso', num(fichaEspera.body?.totalVencido) === 0,
        `totalVencido=${fichaEspera.body?.totalVencido}`);

    const { contasAguardandoConferencia } = require('../services/recebimentoEntregaService');
    const contaT11 = await prisma.contaReceber.findUnique({
        where: { id: t11.conta.id },
        include: {
            parcelas: true,
            pedido: { select: { especial: true, statusEntrega: true, pagamentosReais: true } }
        }
    });
    ok('título é reconhecido como "aguardando conferência"',
        contasAguardandoConferencia([contaT11]).has(t11.conta.id));
    // fiado puro (só responsável) continua sendo dívida
    const contaT16 = await prisma.contaReceber.findUnique({
        where: { id: t16.conta.id },
        include: { parcelas: true, pedido: { select: { especial: true, statusEntrega: true, pagamentosReais: true } } }
    });
    ok('especial fiado puro NÃO entra na janela (continua cobrável)',
        !contasAguardandoConferencia([contaT16]).has(t16.conta.id));

    // ── TESTE 12: cobrança em rota não pendura o título aguardando conferência ──
    console.log('\n[12] Cobrança em rota');
    const r12 = await api('GET', `/api/cobrancas-rota/parcelas-abertas?q=${encodeURIComponent(MARCA)}`);
    const ids12 = (r12.body || []).map(x => x.parcelaId);
    const parcelaT11 = (await prisma.parcela.findMany({ where: { contaReceberId: t11.conta.id } }))[0];
    const parcelaT16 = (await prisma.parcela.findMany({ where: { contaReceberId: t16.conta.id } }))[0];
    ok('rota 200', r12.status === 200, JSON.stringify(r12.body).slice(0, 200));
    ok('especial pago aguardando conferência NÃO aparece', !ids12.includes(parcelaT11.id));
    ok('especial fiado puro (responsável) CONTINUA aparecendo', ids12.includes(parcelaT16.id));

    // ── TESTE 13a/13b: entrega com título já quitado não reabre ──
    console.log('\n[13a/13b] Estorno e edição de entrega com título já quitado');
    const t13 = await criarPedido({ valor: 300, condicao: condDinheiro });
    await prisma.pedidoPagamentoReal.create({
        data: { pedidoId: t13.pedido.id, formaPagamentoNome: FORMA_OK, valor: 300 }
    });
    await prisma.pedido.update({ where: { id: t13.pedido.id }, data: { statusEntrega: 'ENTREGUE', dataEntrega: dataEntregaTeste } });
    await api('POST', '/api/caixa/quitar-ca', { pedidoIds: [t13.pedido.id], dataPagamento: hoje });
    const e13 = await estado(t13.conta.id);
    ok('título quitado antes do teste', e13.status === 'QUITADO');
    const r13a = await api('DELETE', `/api/entregas/${t13.pedido.id}/estorno`);
    const r13b = await api('PATCH', `/api/entregas/${t13.pedido.id}/editar`, {
        pagamentos: [{ formaPagamentoNome: FORMA_OK, valor: 100 }]
    });
    const e13pos = await estado(t13.conta.id);
    ok('estorno da entrega RECUSADO (409)', r13a.status === 409, `${r13a.status} ${JSON.stringify(r13a.body)}`);
    ok('mensagem manda desfazer a baixa antes', /desfa[çc]a a baixa/i.test(r13a.body?.error || ''), r13a.body?.error);
    ok('edição da entrega RECUSADA (409)', r13b.status === 409, `${r13b.status}`);
    ok('título continua QUITADO e ledger intacto',
        e13pos.status === 'QUITADO' && e13pos.parcelas[0].pagamentos.filter(p => !p.estornado).length === 1);
    const pgtos13 = await prisma.pedidoPagamentoReal.count({ where: { pedidoId: t13.pedido.id } });
    ok('pagamentos da entrega não foram apagados', pgtos13 === 1, `${pgtos13} linha(s)`);

    // ── TESTE 13c: caminho oficial — desfazer a quitação, depois estornar a entrega ──
    console.log('\n[13c] Caminho oficial: desfazer a quitação e então estornar a entrega');
    const r13c1 = await api('PUT', `/api/contas-receber/${t13.conta.id}/reverter-quitacao`);
    const e13c = await estado(t13.conta.id);
    const led13c = await prisma.pagamentoParcela.findMany({ where: { parcelaId: e13c.parcelas[0].id } });
    ok('quitação desfeita (200)', r13c1.status === 200, JSON.stringify(r13c1.body));
    ok('nenhum ledger vivo', led13c.every(l => l.estornado));
    ok('parcela PENDENTE e conta ABERTO',
        e13c.parcelas[0].status === 'PENDENTE' && e13c.status === 'ABERTO');
    const r13c2 = await api('DELETE', `/api/entregas/${t13.pedido.id}/estorno`);
    const pgtos13c = await prisma.pedidoPagamentoReal.count({ where: { pedidoId: t13.pedido.id } });
    const ped13c = await prisma.pedido.findUnique({ where: { id: t13.pedido.id }, select: { statusEntrega: true } });
    ok('agora o estorno da entrega funciona (204)', r13c2.status === 204, `${r13c2.status}`);
    ok('pagamentos da entrega apagados e pedido volta a PENDENTE',
        pgtos13c === 0 && ped13c.statusEntrega === 'PENDENTE');
    const conc13 = await prisma.extratoLancamento.count({
        where: { pagamentoParcelaId: { in: led13c.map(l => l.id) } }
    });
    ok('nenhuma conciliação presa nas baixas estornadas', conc13 === 0);

    // ── TESTE 14: rota de baixa em lote desativada ──
    console.log('\n[14] POST /admin-exec/corrigir-especiais-abertos desativada');
    const antes14 = await estado(t16.conta.id);
    const r14 = await fetch(`${base}/api/admin-exec/corrigir-especiais-abertos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': process.env.ADMIN_SECRET },
        body: JSON.stringify({ executar: true })
    });
    const body14 = await r14.json().catch(() => null);
    const depois14 = await estado(t16.conta.id);
    ok('devolve 410', r14.status === 410, `${r14.status} ${JSON.stringify(body14)}`);
    ok('explica o caminho certo', /Caixa/i.test(body14?.comoFazer || ''), body14?.comoFazer);
    ok('não alterou nada', antes14.status === depois14.status
        && antes14.parcelas[0].status === depois14.parcelas[0].status);

    // ── TESTES 10 e 15: régua de cobrança cega para especial/bonificação ──
    console.log('\n[10/15] Régua de cobrança');
    // controle: título NORMAL faturado (tem que continuar aparecendo)
    const t10n = await criarPedido({ valor: 700, especial: false, condicao: condDinheiro, faturado: true });
    // especial COM pedido, faturado (para não ser filtrado pelo filtro antigo por acaso)
    const t10e = await criarPedido({ valor: 800, especial: true, condicao: condDinheiro, faturado: true });
    // bonificação
    const t10b = await criarPedido({ valor: 900, especial: false, bonificacao: true, condicao: condDinheiro, faturado: true });
    // conta ESPECIAL SEM pedido vinculado
    const contaSemPedido = await prisma.contaReceber.create({
        data: {
            clienteId: cliente.UUID, origem: 'ESPECIAL', valorTotal: 600, status: 'ABERTO',
            parcelas: { create: [{ numeroParcela: 1, valor: 600, dataVencimento: new Date(Date.now() - 3 * 86400000), status: 'PENDENTE' }] }
        },
        include: { parcelas: true }
    });
    criados.contas.push(contaSemPedido.id);
    const ontem = new Date(Date.now() - 3 * 86400000);
    for (const c of [t10n.conta.id, t10e.conta.id, t10b.conta.id]) {
        await prisma.parcela.updateMany({ where: { contaReceberId: c }, data: { dataVencimento: ontem } });
    }
    const { montarGrupos } = require('../services/cobrancaService');
    const { grupos } = await montarGrupos();
    const parcelasNaRegua = new Set(grupos.flatMap(g =>
        [...(g.parcelasVencidas || []), ...(g.parcelasAVencer || [])].map(p => p.parcelaId)));
    const idsDe = async (contaId) => (await prisma.parcela.findMany({ where: { contaReceberId: contaId }, select: { id: true } })).map(x => x.id);
    const [idsN, idsE, idsB] = await Promise.all([idsDe(t10n.conta.id), idsDe(t10e.conta.id), idsDe(t10b.conta.id)]);
    const idsSemPedido = contaSemPedido.parcelas.map(p => p.id);
    ok('título NÃO especial continua na régua', idsN.some(id => parcelasNaRegua.has(id)),
        `régua enxerga ${parcelasNaRegua.size} parcelas`);
    ok('especial COM pedido fora da régua', !idsE.some(id => parcelasNaRegua.has(id)));
    ok('conta ESPECIAL sem pedido fora da régua', !idsSemPedido.some(id => parcelasNaRegua.has(id)));
    ok('bonificação fora da régua', !idsB.some(id => parcelasNaRegua.has(id)));


    // ── TESTE 19: PIX comum e CARTÃO no especial quitam (não travam o caixa) ──
    console.log('\n[19] Especial pago em PIX comum + cartão');
    const t19 = await criarPedido({ valor: 300, condicao: condDinheiro });
    await prisma.pedidoPagamentoReal.createMany({
        data: [
            { pedidoId: t19.pedido.id, formaPagamentoNome: 'À vista - Pix', valor: 180 },
            { pedidoId: t19.pedido.id, formaPagamentoNome: 'Cartão - Débito', valor: 120 }
        ]
    });
    await prisma.pedido.update({ where: { id: t19.pedido.id }, data: { statusEntrega: 'ENTREGUE', dataEntrega: dataEntregaTeste } });
    const r19 = await api('POST', '/api/caixa/quitar-ca', { pedidoIds: [t19.pedido.id], dataPagamento: hoje });
    const e19 = await estado(t19.conta.id);
    const led19 = e19.parcelas[0].pagamentos;
    ok('rota 200', r19.status === 200, JSON.stringify(r19.body?.resultados?.[0] || r19.body).slice(0, 220));
    ok('parcela PAGO e conta QUITADO', e19.parcelas[0].status === 'PAGO' && e19.status === 'QUITADO',
        `${e19.parcelas[0].status}/${e19.status}`);
    ok('duas linhas de ledger (pix + cartão) somando R$ 300',
        led19.length === 2 && Math.abs(led19.reduce((s, l) => s + num(l.valorRecebido), 0) - 300) < 0.01,
        `${led19.length} linha(s)`);
    ok('conta financeira fica "não informada" (null), sem chute',
        led19.every(l => l.contaFinanceiraCaId === null));
    // o caixa não pode continuar preso por causa desse pedido
    // é o status QUITADO da conta que tira o pedido de "quitPendentes" no fechar e no
    // reabrir-pendentes (ambos usam exatamente esta condição)
    ok('sai das pendências de fechamento (conta QUITADO)', e19.status === 'QUITADO');

    // ── TESTE 20: idempotência POR FILA não troca a conta do dinheiro ──
    console.log('\n[20] Idempotência por fila (quebra por conta financeira)');
    const t20 = await criarPedido({ valor: 300, condicao: condDinheiro });
    // 1ª passada: só o PIX (conta diferente da do dinheiro)
    await prisma.pedidoPagamentoReal.create({
        data: { pedidoId: t20.pedido.id, formaPagamentoNome: 'À vista - Pix', valor: 50 }
    });
    await prisma.pedido.update({ where: { id: t20.pedido.id }, data: { statusEntrega: 'ENTREGUE', dataEntrega: dataEntregaTeste } });
    const r20a = await api('POST', '/api/caixa/quitar-ca', { pedidoIds: [t20.pedido.id], dataPagamento: hoje }); // 1ª passada: só Asaas
    console.log('     1ª passada:', JSON.stringify(r20a.body?.resultados?.[0] || r20a.body).slice(0, 250));
    // agora entra o dinheiro (R$ 100) e roda de novo
    await prisma.pedidoPagamentoReal.create({
        data: { pedidoId: t20.pedido.id, formaPagamentoNome: FORMA_OK, valor: 100 }
    });
    const r20b = await api('POST', '/api/caixa/quitar-ca', { pedidoIds: [t20.pedido.id], dataPagamento: hoje });
    console.log('     2ª passada:', JSON.stringify(r20b.body?.resultados?.[0] || r20b.body).slice(0, 250));
    const e20 = await estado(t20.conta.id);
    const led20 = e20.parcelas[0].pagamentos.filter(l => !l.estornado);
    const porConta20 = {};
    for (const l of led20) porConta20[l.contaFinanceiraCaId || 'null'] = num(porConta20[l.contaFinanceiraCaId || 'null']) + num(l.valorRecebido);
    const asaasCfg = (await prisma.appConfig.findUnique({ where: { key: 'asaas_conta_financeira_ca_id' } }))?.value || null;
    ok('total recebido = R$ 150', Math.abs(led20.reduce((s, l) => s + num(l.valorRecebido), 0) - 150) < 0.01,
        JSON.stringify(porConta20));
    ok('R$ 100 na Caixinha (dinheiro), sem vazar para a conta do PIX',
        Math.abs(num(porConta20[caixinhaId]) - 100) < 0.01, JSON.stringify(porConta20));
    ok('R$ 50 na conta do PIX ("não informada" enquanto não houver conta definida)',
        Math.abs(num(porConta20['null']) - 50) < 0.01,
        `contaAsaasConfigurada=${asaasCfg} → ${JSON.stringify(porConta20)}`);
    ok('nenhuma linha duplicada do PIX', led20.filter(l => l.formaPagamento === 'À vista - Pix').length === 1);

    // ── TESTE 21: reverter especial ENTREGUE é recusado ──
    console.log('\n[21] Reverter aprovação de especial já ENTREGUE');
    const t21 = await criarPedido({ valor: 200, condicao: condDinheiro });
    await prisma.pedido.update({
        where: { id: t21.pedido.id },
        data: { statusEntrega: 'ENTREGUE', dataEntrega: dataEntregaTeste, statusEnvio: 'RECEBIDO', situacaoCA: 'FATURADO' }
    });
    const r21 = await api('PUT', `/api/pedidos/${t21.pedido.id}/reverter-especial`);
    const e21 = await estado(t21.conta.id);
    const ped21 = await prisma.pedido.findUnique({ where: { id: t21.pedido.id }, select: { statusEnvio: true } });
    ok('reversão recusada (400)', r21.status === 400, `${r21.status} ${JSON.stringify(r21.body)}`);
    ok('mensagem explica que já foi entregue', /já foi entregue/i.test(r21.body?.error || ''), r21.body?.error);
    ok('conta e parcelas intactas (nada cancelado)',
        e21.status === 'ABERTO' && e21.parcelas[0].status === 'PENDENTE' && ped21.statusEnvio === 'RECEBIDO');

    // ── TESTE 22: parcela PARCIAL vencida continua sendo inadimplência ──
    console.log('\n[22] PARCIAL vencida bloqueia venda e conta como atraso');
    const t22 = await criarPedido({ valor: 400, especial: false, condicao: condDinheiro, faturado: true, clienteUuid: clienteParcial.UUID });
    const parcela22 = (await prisma.parcela.findMany({ where: { contaReceberId: t22.conta.id } }))[0];
    await prisma.parcela.update({
        where: { id: parcela22.id },
        data: { status: 'PARCIAL', valorPago: 150, dataVencimento: new Date(Date.now() - 10 * 86400000) }
    });
    await prisma.contaReceber.update({ where: { id: t22.conta.id }, data: { status: 'PARCIAL' } });
    const r22 = await api('POST', '/api/pedidos', {
        clienteId: clienteParcial.UUID, vendedorId: vendedorComum.id,
        dataVenda: new Date(Date.now() + 7 * 86400000).toISOString(), statusEnvio: 'ABERTO',
        tipoPagamento: condDinheiro.tipoPagamento, opcaoCondicaoPagamento: condDinheiro.opcaoCondicao,
        nomeCondicaoPagamento: condDinheiro.nomeCondicao,
        itens: [{ produtoId: produto.id, quantidade: 1, valor: 50, valorBase: 50 }]
    }, tokenVend);
    if (r22.body?.id) criados.pedidos.push(r22.body.id);
    // condição à vista é liberada, mas o atraso TEM que ser detectado (carimbo na observação)
    ok('atraso detectado na parcela PARCIAL vencida',
        r22.status === 201 && /atraso/i.test(r22.body?.observacoes || ''),
        `${r22.status} ${(r22.body?.observacoes || '').trim()}`);
    ok('carimbo usa o SALDO (R$ 250,00), não o valor cheio',
        /250,00/.test(r22.body?.observacoes || ''), (r22.body?.observacoes || '').trim());
    const fichaInad = await api('GET', `/api/clientes/${clienteParcial.UUID}/inadimplencia`);
    ok('ficha do cliente conta o SALDO (R$ 250)',
        Math.abs(num(fichaInad.body?.totalVencido) - 250) < 0.01,
        `totalVencido=${fichaInad.body?.totalVencido}`);
    const listaClientes = await api('GET', `/api/clientes?search=${encodeURIComponent(MARCA + ' Cliente Parcial')}&limit=5`);
    const cliParcial = (listaClientes.body?.data || []).find(c => c.UUID === clienteParcial.UUID);
    ok('selo de inadimplente na listagem usa o saldo',
        !!cliParcial?.inadimplente && Math.abs(num(cliParcial?.totalVencido) - 250) < 0.01,
        JSON.stringify({ inadimplente: cliParcial?.inadimplente, totalVencido: cliParcial?.totalVencido }));
    // volta o cenário para não contaminar os testes seguintes
    await prisma.parcela.update({ where: { id: parcela22.id }, data: { status: 'CANCELADO' } });
    await prisma.contaReceber.update({ where: { id: t22.conta.id }, data: { status: 'CANCELADO' } });

    // ── TESTE 23: 409 SÓ para baixa nascida da entrega ──
    console.log('\n[23] Entrega com título baixado por outra origem (conciliação/manual)');
    const t23 = await criarPedido({ valor: 300, especial: false, condicao: condDinheiro });
    await prisma.pedidoPagamentoReal.create({
        data: { pedidoId: t23.pedido.id, formaPagamentoNome: FORMA_OK, valor: 300 }
    });
    await prisma.pedido.update({ where: { id: t23.pedido.id }, data: { statusEntrega: 'ENTREGUE', dataEntrega: dataEntregaTeste } });
    const parcela23 = (await prisma.parcela.findMany({ where: { contaReceberId: t23.conta.id } }))[0];
    await prisma.pagamentoParcela.create({
        data: {
            parcelaId: parcela23.id, valorRecebido: 300, formaPagamento: 'Boleto',
            dataPagamento: new Date(), origem: 'CONCILIACAO', registradoPorId: usuarioCaixa.id
        }
    });
    await prisma.parcela.update({ where: { id: parcela23.id }, data: { status: 'PAGO', valorPago: 300 } });
    await prisma.contaReceber.update({ where: { id: t23.conta.id }, data: { status: 'QUITADO' } });
    const r23 = await api('PATCH', `/api/entregas/${t23.pedido.id}/editar`, {
        pagamentos: [{ formaPagamentoNome: FORMA_OK, valor: 300 }]
    });
    ok('edição PERMITIDA (baixa veio da conciliação, não da entrega)', r23.status === 200,
        `${r23.status} ${JSON.stringify(r23.body)}`);
    const led23 = await prisma.pagamentoParcela.count({ where: { parcelaId: parcela23.id, estornado: false } });
    ok('baixa da conciliação intacta', led23 === 1);

    // ── TESTE 24: responsável não entra no "a prestar" (decisão do dono) ──
    console.log('\n[24] "Responsável" fora do valor a prestar');
    const t24 = await criarPedido({ valor: 350, condicao: condDinheiro });
    await prisma.pedidoPagamentoReal.create({
        data: { pedidoId: t24.pedido.id, formaPagamentoNome: 'Vendedor responsável', valor: 350, vendedorResponsavelId: motorista.id }
    });
    await prisma.pedido.update({ where: { id: t24.pedido.id }, data: { statusEntrega: 'ENTREGUE', dataEntrega: dataEntregaTeste } });
    const r24 = await api('GET', `/api/caixa/resumo?data=${hoje}&vendedorId=${motorista.id}`);
    const linha24 = (r24.body?.entregas || []).find(e => e.pedidoId === t24.pedido.id);
    const e24 = await estado(t24.conta.id);
    ok('vendedor responsável NÃO debita o caixa',
        linha24?.pagamentos?.every(p => p.debitaCaixa === false), JSON.stringify(linha24?.pagamentos));
    ok('valor cai em "recebido outros", fora do a prestar',
        (r24.body?.detalhamentoCaixa || []).every(d => !(d.condicao === 'Vendedor responsável' && d.debitaCaixa)),
        JSON.stringify(r24.body?.detalhamentoCaixa));
    ok('título continua ABERTO com o valor cheio e sem ledger',
        e24.status === 'ABERTO' && e24.parcelas[0].status === 'PENDENTE'
        && num(e24.parcelas[0].valor) === 350 && e24.parcelas[0].pagamentos.length === 0);
    const rFechar24 = await api('POST', '/api/caixa/fechar', { data: hoje, vendedorId: motorista.id });
    ok('fechamento não trava por causa do responsável',
        !JSON.stringify(rFechar24.body || '').includes(String(t24.pedido.numero || 'zzz')),
        JSON.stringify(rFechar24.body).slice(0, 200));


    // ── TESTE 25: devolução de especial NA JANELA (entregue, ainda não conferido) ──
    console.log('\n[25] Devolução de especial antes da conferência do caixa');
    const t25 = await criarPedido({ valor: 300, condicao: condDinheiro });
    const item25 = (await prisma.pedidoItem.findMany({ where: { pedidoId: t25.pedido.id } }))[0];
    await prisma.pedido.update({
        where: { id: t25.pedido.id },
        data: { statusEntrega: 'ENTREGUE_PARCIAL', dataEntrega: dataEntregaTeste, statusEnvio: 'RECEBIDO' }
    });
    // devolve 1/3 do pedido (R$ 100 de R$ 300)
    const r25 = await api('POST', '/api/devolucoes/especial', {
        pedidoId: t25.pedido.id,
        motivo: 'TESTE',
        itens: [{ produtoId: item25.produtoId, quantidade: 0.333333, valorUnitario: 300 }]
    });
    const e25 = await estado(t25.conta.id);
    ok('devolução registrada', [200, 201].includes(r25.status), `${r25.status} ${JSON.stringify(r25.body).slice(0, 200)}`);
    ok('saldo do título ABATE a devolução (parcela reduzida)',
        num(e25.parcelas[0].valor) < 300 && num(e25.parcelas[0].valor) > 0,
        `parcela agora R$ ${num(e25.parcelas[0].valor)}`);
    ok('parcela continua em aberto (sem ledger, nada foi baixado)',
        e25.parcelas[0].pagamentos.length === 0 && ['PENDENTE', 'PARCIAL', 'VENCIDO'].includes(e25.parcelas[0].status),
        e25.parcelas[0].status);

    // ── TESTE 26: devolução DEPOIS de baixa parcial não deixa parcela inconsistente ──
    console.log('\n[26] Devolução depois de baixa PARCIAL');
    const t26 = await criarPedido({ valor: 300, condicao: condDinheiro });
    const item26 = (await prisma.pedidoItem.findMany({ where: { pedidoId: t26.pedido.id } }))[0];
    await prisma.pedidoPagamentoReal.create({
        data: { pedidoId: t26.pedido.id, formaPagamentoNome: FORMA_OK, valor: 200 }
    });
    await prisma.pedido.update({
        where: { id: t26.pedido.id },
        data: { statusEntrega: 'ENTREGUE_PARCIAL', dataEntrega: dataEntregaTeste, statusEnvio: 'RECEBIDO' }
    });
    await api('POST', '/api/caixa/quitar-ca', { pedidoIds: [t26.pedido.id], dataPagamento: hoje }); // parcela PARCIAL (200 de 300)
    const r26 = await api('POST', '/api/devolucoes/especial', {
        pedidoId: t26.pedido.id,
        motivo: 'TESTE',
        itens: [{ produtoId: item26.produtoId, quantidade: 0.666666, valorUnitario: 300 }] // devolve ~R$ 200
    });
    const e26 = await estado(t26.conta.id);
    const p26 = e26.parcelas[0];
    ok('devolução registrada', [200, 201].includes(r26.status), `${r26.status} ${JSON.stringify(r26.body).slice(0, 160)}`);
    ok('valor da parcela nunca fica abaixo do que já foi recebido',
        num(p26.valor) >= num(p26.valorPago), `valor=${num(p26.valor)} pago=${num(p26.valorPago)}`);
    ok('status da parcela recalculado (recebido cobre o novo valor → PAGO)',
        num(p26.valorPago) + num(p26.valorDescontoTotal) >= num(p26.valor) - 0.01 ? p26.status === 'PAGO' : p26.status === 'PARCIAL',
        `${p26.status} — valor ${num(p26.valor)} / pago ${num(p26.valorPago)}`);
    ok('ledger da baixa continua intacto (R$ 200)',
        p26.pagamentos.filter(l => !l.estornado).reduce((s, l) => s + num(l.valorRecebido), 0) === 200);
    // (b) conta 100% liquidada PELA devolução tem que sair de "aberto"
    ok('conta 100% liquidada pela devolução fica QUITADO', e26.status === 'QUITADO', `status=${e26.status}`);


    // ── TESTE 27: devolução TOTAL com baixa PARCIAL viva (dinheiro já recebido) ──
    // O ramo TOTAL cancelava tudo que não estava PAGO — inclusive parcela PARCIAL com
    // ledger vivo: o dinheiro continuava contado em Saldos por Conta e no realizado,
    // mas o título sumia do Contas a Receber, sem estorno nem crédito ao cliente.
    console.log('\n[27] Devolução TOTAL de especial com baixa parcial viva');
    const t27 = await criarPedido({ valor: 300, condicao: condDinheiro });
    const item27 = (await prisma.pedidoItem.findMany({ where: { pedidoId: t27.pedido.id } }))[0];
    await prisma.pedidoPagamentoReal.create({
        data: { pedidoId: t27.pedido.id, formaPagamentoNome: FORMA_OK, valor: 150 }
    });
    await prisma.pedido.update({
        where: { id: t27.pedido.id },
        data: { statusEntrega: 'ENTREGUE_PARCIAL', dataEntrega: dataEntregaTeste, statusEnvio: 'RECEBIDO' }
    });
    await api('POST', '/api/caixa/quitar-ca', { pedidoIds: [t27.pedido.id], dataPagamento: hoje }); // PARCIAL 150 de 300
    const r27 = await api('POST', '/api/devolucoes/especial', {
        pedidoId: t27.pedido.id,
        motivo: 'TESTE',
        itens: [{ produtoId: item27.produtoId, quantidade: 1, valorUnitario: 300 }] // devolve TUDO
    });
    const e27 = await estado(t27.conta.id);
    const p27 = e27.parcelas[0];
    const ledger27 = p27.pagamentos.filter(l => !l.estornado);
    ok('devolução TOTAL registrada', [200, 201].includes(r27.status), `${r27.status} ${JSON.stringify(r27.body).slice(0, 160)}`);
    ok('escopo reconhecido como TOTAL', r27.body?.escopo === 'TOTAL', `escopo=${r27.body?.escopo}`);
    ok('parcela com dinheiro recebido NÃO é cancelada', p27.status !== 'CANCELADO', `status=${p27.status}`);
    ok('parcela passa a valer o que já foi recebido (R$ 150) e fica quitada',
        Math.abs(num(p27.valor) - 150) < 0.01 && p27.status === 'PAGO',
        `valor=${num(p27.valor)} status=${p27.status}`);
    ok('ledger continua vivo e batendo com a parcela (sem órfão)',
        ledger27.length === 1 && Math.abs(ledger27.reduce((a, l) => a + num(l.valorRecebido), 0) - num(p27.valor)) < 0.01,
        `${ledger27.length} linha(s) / R$ ${ledger27.reduce((a, l) => a + num(l.valorRecebido), 0)}`);
    ok('conta marcada como DEVOLVIDO com o valor que sobrou liquidado',
        e27.status === 'DEVOLVIDO' && Math.abs(num(e27.valorTotal) - 150) < 0.01,
        `status=${e27.status} valorTotal=${num(e27.valorTotal)}`);
    ok('crédito do cliente REGISTRADO (não some em silêncio)',
        /CRÉDITO A DEVOLVER AO CLIENTE: R\$ 150\.00/.test(r27.body?.observacao || ''),
        (r27.body?.observacao || '(sem observação)').slice(0, 160));

    // (D4) A TELA DO CAIXA PRECISA ENXERGAR "CONTA DEVOLVIDA".
    // A devolução TOTAL grava contaReceber.status='DEVOLVIDO' e NÃO mexe no statusEntrega
    // (segue ENTREGUE_PARCIAL). O getter `quitado` do /caixa/resumo só sabia devolver
    // QUITADO/PARCIAL/ALTERADO, então "devolvida" e "em aberto" chegavam iguais (null) e a
    // linha voltava com selo A CONFERIR e checkbox de Baixa CA num pedido já resolvido.
    const resumo27 = await api('GET', `/api/caixa/resumo?data=${hoje}&vendedorId=${motorista.id}`);
    const linha27 = (resumo27.body?.entregas || []).find(x => x.pedidoId === t27.pedido.id);
    ok('/caixa/resumo respondeu 200 (sem cair em fim de semana)',
        resumo27.status === 200 && !resumo27.body?.diaSemCaixa,
        `${resumo27.status} ${resumo27.body?.diaSemCaixa ? 'diaSemCaixa' : ''}`);
    ok('pedido devolvido continua listado na tela do Caixa', !!linha27,
        `${(resumo27.body?.entregas || []).length} entrega(s) no dia`);
    ok('`quitado` informa que a CONTA está DEVOLVIDA (não vem mais null)',
        linha27?.quitado === 'DEVOLVIDO', `quitado=${JSON.stringify(linha27?.quitado)}`);
    ok('statusEntrega segue ENTREGUE_PARCIAL (nada foi normalizado por baixo do pano)',
        linha27?.statusEntrega === 'ENTREGUE_PARCIAL', `statusEntrega=${linha27?.statusEntrega}`);
    // é exatamente isso que o `baixaJaResolvida` do frontend consome para tirar o selo
    // A CONFERIR e o checkbox de Baixa CA da linha
    ok('linha deixa de ser elegível para Baixa CA (regra do frontend)',
        ['QUITADO', 'ALTERADO', 'DEVOLVIDO', 'CANCELADO'].includes(linha27?.quitado)
        || linha27?.statusEntrega === 'DEVOLVIDO',
        `quitado=${linha27?.quitado} statusEntrega=${linha27?.statusEntrega}`);
    // controle: devolução PARCIAL NÃO pode ser confundida com resolvida — o título do t26
    // (devolução parcial) segue precisando de baixa quando ainda há saldo
    const linha26 = (resumo27.body?.entregas || []).find(x => x.pedidoId === t26.pedido.id);
    // DIAGNÓSTICO (não é asserção). As pendências de fechamento leem contaReceber.status
    // cru; desde 08/2026 DEVOLVIDO/CANCELADO são status FINAIS e NÃO contam como
    // "baixa de dinheiro pendente" (caixa.js: contaSemPendenciaDeCaixa + contador do resumo).
    // A prova isolada disso está no teste [32].
    console.log(`  ℹ️  diagnóstico — quitacoesNaoFeitas no dia: ${resumo27.body?.pendencias?.quitacoesNaoFeitas}`
        + ` | linha devolvida entra na pendência? ${(linha27?.pagamentos || []).some(p => p.debitaCaixa
            && !p.vendedorResponsavelId && !p.escritorioResponsavel
            && (p.formaNome || '').toLowerCase().includes('dinheiro'))
            && !['QUITADO', 'DEVOLVIDO', 'CANCELADO'].includes(linha27?.quitado)
            && linha27?.statusEntrega !== 'DEVOLVIDO'}`);
    ok('devolução PARCIAL não é tratada como "conta devolvida"',
        linha26 && linha26.quitado !== 'DEVOLVIDO' && linha26.devolucaoFinalizada === true,
        `quitado=${linha26?.quitado} devolucaoFinalizada=${linha26?.devolucaoFinalizada}`);

    // ── TESTE 28: quem pagou e espera a conferência não é cobrado ──
    // O painel e o botão "Cobrar agora" chamam montarGrupos({ incluirEspecial: true }).
    // Sem a janela, o cliente que pagou o especial em dinheiro na entrega aparecia como
    // devedor e podia receber cobrança no WhatsApp da Ana antes da conferência do caixa.
    console.log('\n[28] Painel de inadimplentes e "Cobrar agora" com título aguardando conferência');
    const cobrancaService = require('../services/cobrancaService');
    const painel = await cobrancaService.painelInadimplentes();

    const noPainel = (uuid) => (painel.itens || []).some(i => i.cliente.id === uuid);
    ok('cliente que pagou e espera a conferência NÃO aparece no painel',
        !noPainel(clienteEspera.UUID),
        `painel com ${painel.itens?.length || 0} cliente(s); aguardandoConferencia=${painel.totais?.aguardandoConferencia}`);
    ok('painel informa quantas parcelas ficaram de fora (nada invisível)',
        num(painel.totais?.aguardandoConferencia) >= 1,
        `aguardandoConferencia=${painel.totais?.aguardandoConferencia}`);
    const cobrar = await cobrancaService.cobrarClienteAgora(clienteEspera.UUID);
    ok('"Cobrar agora" NÃO dispara mensagem para quem já pagou',
        cobrar.ok === false && /sem parcelas vencidas/i.test(cobrar.motivo || ''),
        JSON.stringify(cobrar).slice(0, 200));
    const envios28 = await prisma.cobrancaEnvio.count({ where: { clienteId: clienteEspera.UUID } });
    ok('nenhum envio de cobrança gravado para esse cliente', envios28 === 0, `${envios28} envio(s)`);
    // controle: devedor de verdade continua no painel (a janela não cegou a cobrança)
    const t28 = await criarPedido({ valor: 500, especial: false, condicao: condDinheiro, faturado: true });
    await prisma.parcela.updateMany({
        where: { contaReceberId: t28.conta.id },
        data: { dataVencimento: new Date(Date.now() - 9 * 86400000) }
    });
    const painel2 = await cobrancaService.painelInadimplentes();
    ok('devedor de verdade continua aparecendo no painel',
        (painel2.itens || []).some(i => i.cliente.id === cliente.UUID),
        `painel com ${painel2.itens?.length || 0} cliente(s)`);

    // ── TESTE 29: inadimplência do dashboard soma SALDO, não o valor cheio ──
    console.log('\n[29] Inadimplência do dashboard do dono (saldo, não valor cheio)');
    const d29a = await api('GET', '/api/admin-dashboard/');
    const t29 = await criarPedido({ valor: 400, condicao: condDinheiro });
    await prisma.pedidoPagamentoReal.create({
        data: { pedidoId: t29.pedido.id, formaPagamentoNome: FORMA_OK, valor: 100 }
    });
    await prisma.pedido.update({
        where: { id: t29.pedido.id },
        data: { statusEntrega: 'ENTREGUE_PARCIAL', dataEntrega: dataEntregaTeste, statusEnvio: 'RECEBIDO' }
    });
    await api('POST', '/api/caixa/quitar-ca', { pedidoIds: [t29.pedido.id], dataPagamento: hoje }); // PARCIAL: 100 de 400
    await prisma.parcela.updateMany({
        where: { contaReceberId: t29.conta.id },
        data: { dataVencimento: new Date(Date.now() - 4 * 86400000) }
    });
    const e29 = await estado(t29.conta.id);
    const d29b = await api('GET', '/api/admin-dashboard/');
    const delta29 = Math.round((num(d29b.body?.inadimplencia?.total) - num(d29a.body?.inadimplencia?.total)) * 100) / 100;
    ok('dashboard respondeu 200 nas duas medições',
        d29a.status === 200 && d29b.status === 200, `${d29a.status}/${d29b.status}`);
    ok('parcela ficou PARCIAL com R$ 100 recebidos de R$ 400',
        e29.parcelas[0].status === 'PARCIAL' && num(e29.parcelas[0].valorPago) === 100,
        `${e29.parcelas[0].status} pago=${num(e29.parcelas[0].valorPago)}`);
    ok('inadimplência cresceu R$ 300 (saldo), não R$ 400 (valor cheio)',
        Math.abs(delta29 - 300) < 0.01, `delta=R$ ${delta29}`);


    // ── TESTE 30: devolução PARCIAL não deixa a conta valendo menos que as parcelas ──
    // Cenário reproduzido pelo QA: título de R$ 108 com R$ 50 já recebidos, devolução
    // parcial de R$ 63. A PARCELA tem piso no que já foi liquidado (fica R$ 50); o
    // valorTotal da conta era calculado à parte, proporcional, e virava R$ 45 — conta
    // valendo MENOS que a soma das próprias parcelas. Agora o total é RELIDO das
    // parcelas depois do ajuste, então os dois números vêm da mesma fonte.
    console.log('\n[30] Devolução PARCIAL: conta nunca vale menos que a soma das parcelas');
    const t30 = await criarPedido({ valor: 108, condicao: condDinheiro });
    const item30 = (await prisma.pedidoItem.findMany({ where: { pedidoId: t30.pedido.id } }))[0];
    await prisma.pedidoPagamentoReal.create({
        data: { pedidoId: t30.pedido.id, formaPagamentoNome: FORMA_OK, valor: 50 }
    });
    await prisma.pedido.update({
        where: { id: t30.pedido.id },
        data: { statusEntrega: 'ENTREGUE_PARCIAL', dataEntrega: dataEntregaTeste, statusEnvio: 'RECEBIDO' }
    });
    await api('POST', '/api/caixa/quitar-ca', { pedidoIds: [t30.pedido.id], dataPagamento: hoje }); // PARCIAL: 50 de 108
    const e30pre = await estado(t30.conta.id);
    ok('preparo: parcela PARCIAL com R$ 50 recebidos de R$ 108',
        e30pre.parcelas[0].status === 'PARCIAL' && num(e30pre.parcelas[0].valorPago) === 50,
        `${e30pre.parcelas[0].status} pago=${num(e30pre.parcelas[0].valorPago)}`);
    const r30 = await api('POST', '/api/devolucoes/especial', {
        pedidoId: t30.pedido.id,
        motivo: 'TESTE',
        itens: [{ produtoId: item30.produtoId, quantidade: 63 / 108, valorUnitario: 108 }] // devolve R$ 63
    });
    const e30 = await estado(t30.conta.id);
    const p30 = e30.parcelas[0];
    const soma30 = round2(e30.parcelas
        .filter(p => p.status !== 'CANCELADO')
        .reduce((s, p) => s + num(p.valor), 0));
    ok('devolução parcial registrada', [200, 201].includes(r30.status),
        `${r30.status} ${JSON.stringify(r30.body).slice(0, 160)}`);
    ok('escopo é PARCIAL', r30.body?.escopo === 'PARCIAL', `escopo=${r30.body?.escopo}`);
    ok('parcela mantém o piso do que já foi recebido (R$ 50) e fica quitada',
        Math.abs(num(p30.valor) - 50) < 0.01 && p30.status === 'PAGO',
        `valor=${num(p30.valor)} status=${p30.status}`);
    ok('valorTotal da conta = soma das parcelas (números da tela fecham)',
        Math.abs(num(e30.valorTotal) - soma30) < 0.01,
        `valorTotal=${num(e30.valorTotal)} soma das parcelas=${soma30}`);
    ok('valorTotal NÃO caiu abaixo do liquidado (era R$ 45 antes da correção)',
        num(e30.valorTotal) >= 50 - 0.01, `valorTotal=${num(e30.valorTotal)}`);
    ok('ledger da baixa continua intacto (R$ 50, nada estornado)',
        Math.abs(p30.pagamentos.filter(l => !l.estornado)
            .reduce((s, l) => s + num(l.valorRecebido), 0) - 50) < 0.01,
        `${p30.pagamentos.filter(l => !l.estornado).length} linha(s)`);
    ok('crédito ao cliente (R$ 5,00) continua REGISTRADO na devolução',
        /CRÉDITO A DEVOLVER AO CLIENTE: R\$ 5\.00/.test(r30.body?.observacao || ''),
        (r30.body?.observacao || '(sem observação)').slice(0, 160));

    // ── TESTE 31: recorte `desdeDias` da janela de conferência ──
    // O recorte existe SÓ para leitura (dashboard/aging). Duas provas obrigatórias:
    //   1. pedido SEM data de entrega (dataEntrega null) continua protegido mesmo com
    //      recorte — o `gte` do Prisma exclui linha null, por isso o OR explícito;
    //   2. entrega ANTIGA sai do recorte curto, mas continua protegida na consulta SEM
    //      recorte, que é a usada por bloqueio de venda, selo, ficha e painel de cobrança.
    console.log('\n[31] Recorte desdeDias da janela "aguardando conferência"');
    const { idsContasEmEsperaDeConferencia: idsJanela } = require('../services/recebimentoEntregaService');
    const t31nulo = await criarPedido({ valor: 400, condicao: condDinheiro, clienteUuid: clienteEspera.UUID });
    await prisma.pedidoPagamentoReal.create({
        data: { pedidoId: t31nulo.pedido.id, formaPagamentoNome: FORMA_OK, valor: 400 }
    });
    await prisma.pedido.update({
        where: { id: t31nulo.pedido.id },
        data: { statusEntrega: 'ENTREGUE', dataEntrega: null } // entregue, mas sem data registrada
    });
    const t31velho = await criarPedido({ valor: 700, condicao: condDinheiro, clienteUuid: clienteEspera.UUID });
    await prisma.pedidoPagamentoReal.create({
        data: { pedidoId: t31velho.pedido.id, formaPagamentoNome: FORMA_OK, valor: 700 }
    });
    await prisma.pedido.update({
        where: { id: t31velho.pedido.id },
        data: { statusEntrega: 'ENTREGUE', dataEntrega: new Date(Date.now() - 200 * 86400000) } // 200 dias atrás
    });
    // vencido de verdade: sem a proteção SEM RECORTE, este título apareceria na ficha
    await prisma.parcela.updateMany({
        where: { contaReceberId: t31velho.conta.id },
        data: { dataVencimento: new Date(Date.now() - 150 * 86400000) }
    });
    const janelaSemRecorte = await idsJanela();
    const janela90 = await idsJanela({ desdeDias: 90 });
    ok('SEM recorte: entrega sem data está protegida', janelaSemRecorte.has(t31nulo.conta.id));
    ok('SEM recorte: entrega de 200 dias atrás está protegida (proteção não vence)',
        janelaSemRecorte.has(t31velho.conta.id));
    ok('COM recorte de 90 dias: entrega SEM data continua protegida (OR com dataEntrega null)',
        janela90.has(t31nulo.conta.id));
    ok('COM recorte de 90 dias: entrega de 200 dias atrás fica de fora (só leitura)',
        !janela90.has(t31velho.conta.id));
    ok('recorte por cliente continua funcionando junto com o desdeDias',
        (await idsJanela({ clienteIds: [clienteEspera.UUID], desdeDias: 90 })).has(t31nulo.conta.id));
    // prova de que os pontos que PROTEGEM o cliente não usam recorte:
    const fichaVelha = await api('GET', `/api/clientes/${clienteEspera.UUID}/inadimplencia`);
    ok('ficha do cliente (sem recorte) não acusa atraso nem no título antigo',
        num(fichaVelha.body?.totalVencido) === 0, `totalVencido=${fichaVelha.body?.totalVencido}`);

    // ── TESTE 32: conta DEVOLVIDA não trava mais o fechamento do caixa ──
    // Devolução TOTAL grava contaReceber.status='DEVOLVIDO' e NÃO mexe no statusEntrega
    // (segue ENTREGUE_PARCIAL). As pendências de fechamento só aceitavam QUITADO/PARCIAL,
    // então o título devolvido — onde NÃO HÁ o que baixar — ficava eternamente como
    // "baixa de dinheiro pendente" e travava o Fechar Caixa.
    // Prova em duas metades, na MESMA leitura de resumo, para nada mais mudar no meio:
    //   (a) antes da devolução, o especial com dinheiro em aberto CONTA como pendência;
    //   (b) depois da devolução total, o contador CAI em 1 — e um segundo especial com
    //       dinheiro de verdade em aberto CONTINUA travando (não liberamos nada indevido).
    console.log('\n[32] Conta DEVOLVIDA não trava o fechamento (e dinheiro em aberto continua travando)');
    const t32dev = await criarPedido({ valor: 250, condicao: condDinheiro });
    const item32 = (await prisma.pedidoItem.findMany({ where: { pedidoId: t32dev.pedido.id } }))[0];
    await prisma.pedidoPagamentoReal.create({
        data: { pedidoId: t32dev.pedido.id, formaPagamentoNome: FORMA_OK, valor: 250 }
    });
    await prisma.pedido.update({
        where: { id: t32dev.pedido.id },
        data: { statusEntrega: 'ENTREGUE_PARCIAL', dataEntrega: dataEntregaTeste, statusEnvio: 'RECEBIDO' }
    });
    // controle (b): especial com dinheiro DE VERDADE em aberto, criado junto
    const t32aberto = await criarPedido({ valor: 180, condicao: condDinheiro });
    await prisma.pedidoPagamentoReal.create({
        data: { pedidoId: t32aberto.pedido.id, formaPagamentoNome: FORMA_OK, valor: 180 }
    });
    await prisma.pedido.update({
        where: { id: t32aberto.pedido.id },
        data: { statusEntrega: 'ENTREGUE', dataEntrega: dataEntregaTeste, statusEnvio: 'RECEBIDO' }
    });
    const res32a = await api('GET', `/api/caixa/resumo?data=${hoje}&vendedorId=${motorista.id}`);
    const pend32a = num(res32a.body?.pendencias?.quitacoesNaoFeitas);
    const linha32aA = (res32a.body?.entregas || []).find(x => x.pedidoId === t32dev.pedido.id);
    ok('(a) antes da devolução, o especial com dinheiro em aberto é pendência',
        pend32a >= 2 && linha32aA?.quitado == null,
        `quitacoesNaoFeitas=${pend32a} quitado=${JSON.stringify(linha32aA?.quitado)}`);
    // devolução TOTAL → conta DEVOLVIDO
    const r32 = await api('POST', '/api/devolucoes/especial', {
        pedidoId: t32dev.pedido.id, motivo: 'TESTE',
        itens: [{ produtoId: item32.produtoId, quantidade: 1, valorUnitario: 250 }]
    });
    const e32 = await estado(t32dev.conta.id);
    ok('devolução TOTAL deixou a conta como DEVOLVIDO',
        [200, 201].includes(r32.status) && e32.status === 'DEVOLVIDO',
        `${r32.status} status=${e32.status}`);
    const res32b = await api('GET', `/api/caixa/resumo?data=${hoje}&vendedorId=${motorista.id}`);
    const pend32b = num(res32b.body?.pendencias?.quitacoesNaoFeitas);
    ok('(a) contador de pendências CAIU em 1 — a conta devolvida saiu da lista',
        pend32b === pend32a - 1, `antes=${pend32a} depois=${pend32b}`);
    // (b) o dinheiro de verdade em aberto continua travando: o fechar tem que recusar
    const fechar32 = await api('POST', '/api/caixa/fechar', { data: hoje, vendedorId: motorista.id });
    ok('(b) fechar o caixa continua RECUSADO enquanto há dinheiro em aberto',
        fechar32.status >= 400 && /baixa\(s\) de recebimento pendente/.test(fechar32.body?.error || ''),
        `${fechar32.status} ${(fechar32.body?.error || '').replace(/\n/g, ' | ').slice(0, 160)}`);
    const linha32B = (res32b.body?.entregas || []).find(x => x.pedidoId === t32dev.pedido.id);
    ok('(b) o que ainda trava é dinheiro de verdade — o devolvido saiu com status final',
        pend32b >= 1 && linha32B?.quitado === 'DEVOLVIDO',
        `pendências restantes=${pend32b} quitado do devolvido=${JSON.stringify(linha32B?.quitado)}`);

    // ── TESTE 33: contador da TELA e gate do SERVIDOR decidem igual ──
    // O contador do GET /resumo (pendencias.podeFechar, que habilita o botão) e o gate do
    // POST /fechar decidiam a mesma coisa com critérios diferentes:
    //   • o contador excluía só QUITADO/DEVOLVIDO/CANCELADO e olhava só "dinheiro";
    //   • o gate excluía também PARCIAL e olhava dinheiro|pix|cartão.
    // Com a baixa PARCIAL virando rotina no especial (recebeu menos), isso travava o botão
    // "Fechar Caixa" PARA SEMPRE: o servidor aceitava fechar, mas ninguém conseguia chamar.
    // Agora os dois usam o MESMO helper (caixa.js: entregaPendenteDeBaixaNoCaixa).
    // Dia isolado num motorista só deste teste — senão as pendências dos testes anteriores
    // impediriam provar o caso "servidor aceita fechar".
    console.log('\n[33] Contador da tela × gate do fechar: mesma decisão (baixa parcial, aberto e formas)');
    const motorista33 = await prisma.vendedor.create({
        data: { id: `${MARCA}-MOT33`, nome: `${MARCA} Motorista 33`, permissoes: { admin: true } }
    });
    // A conferência do DINHEIRO é outra pendência do fechar (chave própria) e mascararia o
    // que este teste mede. Desligada só aqui e RESTAURADA no finally.
    const cfgConfCaixa = require('../config/caixaConferenciaConfig');
    const cfg33Antes = { ...(await cfgConfCaixa.get()) };
    await cfgConfCaixa.salvar({ ativo: false });
    try {
    const resumo33 = async () => {
        const r = await api('GET', `/api/caixa/resumo?data=${hoje}&vendedorId=${motorista33.id}`);
        return {
            status: r.status,
            pend: num(r.body?.pendencias?.quitacoesNaoFeitas),
            podeFechar: r.body?.pendencias?.podeFechar,
            entregas: r.body?.entregas || []
        };
    };
    const fechar33 = () => api('POST', '/api/caixa/fechar', { data: hoje, vendedorId: motorista33.id });

    // (b) especial de R$ 200 com dinheiro TOTALMENTE em aberto → tem que travar dos dois lados
    const t33 = await criarPedido({ valor: 200, condicao: condDinheiro, responsavelId: motorista33.id });
    await prisma.pedidoPagamentoReal.create({
        data: { pedidoId: t33.pedido.id, formaPagamentoNome: FORMA_OK, valor: 150 }
    });
    await prisma.pedido.update({
        where: { id: t33.pedido.id },
        data: { statusEntrega: 'ENTREGUE', dataEntrega: dataEntregaTeste, statusEnvio: 'RECEBIDO' }
    });
    const r33b = await resumo33();
    const f33b = await fechar33();
    ok('(b) /resumo respondeu 200 no dia isolado', r33b.status === 200, `${r33b.status}`);
    ok('(b) dinheiro em aberto: a TELA aponta 1 pendência e não deixa fechar',
        r33b.pend === 1 && r33b.podeFechar === false,
        `quitacoesNaoFeitas=${r33b.pend} podeFechar=${r33b.podeFechar}`);
    ok('(b) dinheiro em aberto: o SERVIDOR também recusa o fechamento',
        f33b.status >= 400 && /baixa\(s\) de recebimento pendente/.test(f33b.body?.error || ''),
        `${f33b.status} ${(f33b.body?.error || '').replace(/\n/g, ' | ').slice(0, 120)}`);

    // (a) baixa PARCIAL (recebeu R$ 150 de R$ 200) → tela e servidor têm que concordar
    const q33 = await api('POST', '/api/caixa/quitar-ca', { pedidoIds: [t33.pedido.id], dataPagamento: hoje });
    const e33 = await estado(t33.conta.id);
    ok('(a) baixa parcial gravada: conta PARCIAL com saldo de R$ 50',
        q33.status === 200 && e33.status === 'PARCIAL'
        && Math.abs(num(e33.parcelas[0].valor) - num(e33.parcelas[0].valorPago) - 50) < 0.01,
        `status=${e33.status} saldo=${num(e33.parcelas[0].valor) - num(e33.parcelas[0].valorPago)}`);
    const r33a = await resumo33();
    const linha33a = r33a.entregas.find(x => x.pedidoId === t33.pedido.id);
    ok('(a) conta PARCIAL sai do contador da tela (era o defeito: ficava travado)',
        r33a.pend === 0 && r33a.podeFechar === true,
        `quitacoesNaoFeitas=${r33a.pend} podeFechar=${r33a.podeFechar}`);
    ok('(a) a própria linha se declara sem pendência de baixa',
        linha33a?.pendenteBaixaCaixa === false && linha33a?.quitado === 'PARCIAL',
        `pendenteBaixaCaixa=${linha33a?.pendenteBaixaCaixa} quitado=${linha33a?.quitado}`);
    const f33a = await fechar33();
    ok('(a) o SERVIDOR aceita fechar — tela e servidor concordam',
        f33a.status === 200, `${f33a.status} ${JSON.stringify(f33a.body?.error || '').slice(0, 160)}`);
    // reabre para seguir usando o mesmo dia nos próximos casos
    await prisma.caixaDiario.updateMany({
        where: { vendedorId: motorista33.id, dataReferencia: hoje }, data: { status: 'ABERTO' }
    });

    // (c) formas: PIX e cartão em aberto contam nos DOIS lados (antes só o gate via)
    const t33pix = await criarPedido({ valor: 90, condicao: condDinheiro, responsavelId: motorista33.id });
    await prisma.pedidoPagamentoReal.create({
        data: { pedidoId: t33pix.pedido.id, formaPagamentoNome: 'PIX', valor: 90 }
    });
    const t33cartao = await criarPedido({ valor: 70, condicao: condDinheiro, responsavelId: motorista33.id });
    await prisma.pedidoPagamentoReal.create({
        data: { pedidoId: t33cartao.pedido.id, formaPagamentoNome: 'Cartão de Débito', valor: 70 }
    });
    for (const t of [t33pix, t33cartao]) {
        await prisma.pedido.update({
            where: { id: t.pedido.id },
            data: { statusEntrega: 'ENTREGUE', dataEntrega: dataEntregaTeste, statusEnvio: 'RECEBIDO' }
        });
    }
    const r33c = await resumo33();
    const f33c = await fechar33();
    const linhaPix = r33c.entregas.find(x => x.pedidoId === t33pix.pedido.id);
    const linhaCartao = r33c.entregas.find(x => x.pedidoId === t33cartao.pedido.id);
    ok('(c) PIX e cartão em aberto entram no contador da tela (2 pendências)',
        r33c.pend === 2 && r33c.podeFechar === false,
        `quitacoesNaoFeitas=${r33c.pend} podeFechar=${r33c.podeFechar}`);
    ok('(c) as duas linhas se declaram pendentes de baixa',
        linhaPix?.pendenteBaixaCaixa === true && linhaCartao?.pendenteBaixaCaixa === true,
        `pix=${linhaPix?.pendenteBaixaCaixa} cartao=${linhaCartao?.pendenteBaixaCaixa}`);
    ok('(c) o servidor recusa fechar pelo mesmo motivo (sem divergência)',
        f33c.status >= 400 && /baixa\(s\) de recebimento pendente/.test(f33c.body?.error || ''),
        `${f33c.status} ${(f33c.body?.error || '').replace(/\n/g, ' | ').slice(0, 120)}`);
    ok('(c) o servidor aponta exatamente os dois pedidos de PIX/cartão',
        (f33c.body?.quitacoesIds || []).length === 2
        && (f33c.body.quitacoesIds).includes(t33pix.pedido.id)
        && (f33c.body.quitacoesIds).includes(t33cartao.pedido.id),
        JSON.stringify(f33c.body?.quitacoesIds));

    // resolvidos os dois, tela e servidor voltam a liberar juntos
    for (const t of [t33pix, t33cartao]) {
        await prisma.parcela.updateMany({ where: { contaReceberId: t.conta.id }, data: { status: 'PAGO' } });
        await prisma.contaReceber.update({ where: { id: t.conta.id }, data: { status: 'QUITADO' } });
    }
    const r33d = await resumo33();
    const f33d = await fechar33();
    ok('(c) baixados os títulos, a tela libera o botão de novo',
        r33d.pend === 0 && r33d.podeFechar === true,
        `quitacoesNaoFeitas=${r33d.pend} podeFechar=${r33d.podeFechar}`);
    ok('(c) e o servidor fecha o caixa (200)', f33d.status === 200,
        `${f33d.status} ${JSON.stringify(f33d.body?.error || '').slice(0, 160)}`);

    // controle final: nada que ainda tem dinheiro a prestar deixou de travar
    const t33trava = await criarPedido({ valor: 300, condicao: condDinheiro, responsavelId: motorista33.id });
    await prisma.pedidoPagamentoReal.create({
        data: { pedidoId: t33trava.pedido.id, formaPagamentoNome: FORMA_OK, valor: 300 }
    });
    await prisma.pedido.update({
        where: { id: t33trava.pedido.id },
        data: { statusEntrega: 'ENTREGUE', dataEntrega: dataEntregaTeste, statusEnvio: 'RECEBIDO' }
    });
    await prisma.caixaDiario.updateMany({
        where: { vendedorId: motorista33.id, dataReferencia: hoje }, data: { status: 'ABERTO' }
    });
    const r33e = await resumo33();
    const f33e = await fechar33();
    ok('controle: dinheiro novo em aberto volta a travar nos DOIS lados',
        r33e.pend === 1 && r33e.podeFechar === false && f33e.status >= 400,
        `pend=${r33e.pend} podeFechar=${r33e.podeFechar} fechar=${f33e.status}`);
    } finally {
        await cfgConfCaixa.salvar({ ativo: cfg33Antes.ativo, desde: cfg33Antes.desde });
        const cfg33Depois = await cfgConfCaixa.get();
        ok('chave da conferência do dinheiro restaurada como estava',
            cfg33Depois.ativo === cfg33Antes.ativo && cfg33Depois.desde === cfg33Antes.desde,
            `ativo=${cfg33Depois.ativo} desde=${cfg33Depois.desde}`);
    }


    // ── TESTE 34: pedido faturado NO APP (situacaoCA null) conta como inadimplência ──
    // Defeito corrigido em 08/2026: o filtro usava `NOT: [{ pedido: { situacaoCA: 'CANCELADO' } }]`.
    // Em SQL, NOT (situacao_ca = 'CANCELADO') com o campo NULL resulta em NULL → a linha é
    // DESCARTADA. Como todo pedido faturado localmente (padrão desde que o CA virou somente
    // leitura) nasce com situacaoCA null, o título dele ficava invisível para o bloqueio de
    // venda, para a ficha do cliente e para o selo da listagem — cliente devia à vontade e
    // continuava comprando. Provas: (a) o devedor de hoje bloqueia; (b) o caso antigo
    // (situacaoCA='FATURADO') não regrediu; (c) quem pagou e aguarda a conferência do Caixa
    // continua protegido — agora pelo motivo certo, não por acidente do filtro.
    console.log('\n[34] Título de pedido faturado no app (situacaoCA null) é visto pelo controle de crédito');
    const condPrazo = await prisma.tabelaPreco.findFirst({ where: { ativo: true, nomeCondicao: '7 dias - Boleto' } });
    if (!condPrazo) throw new Error('Condição "7 dias - Boleto" não encontrada no banco local.');

    // pedido normal, faturado NO APP: statusEnvio RECEBIDO e situacaoCA NULL
    const criarDevedorLocal = async (sufixo, situacaoCA) => {
        const cli = await prisma.cliente.create({
            data: {
                UUID: `${MARCA}-${sufixo}`, Nome: `${MARCA} ${sufixo}`, NomeFantasia: `${MARCA} ${sufixo}`,
                Condicao_de_pagamento: 'AVISTA_DIN'
            }
        });
        const t = await criarPedido({ valor: 300, especial: false, condicao: condDinheiro, clienteUuid: cli.UUID });
        await prisma.pedido.update({
            where: { id: t.pedido.id },
            data: { statusEnvio: 'RECEBIDO', situacaoCA }
        });
        await prisma.parcela.updateMany({
            where: { contaReceberId: t.conta.id },
            data: { dataVencimento: new Date(Date.now() - 10 * 86400000) }
        });
        return { cli, ...t };
    };

    const tentarVenderAPrazo = async (clienteUuid) => api('POST', '/api/pedidos', {
        clienteId: clienteUuid, vendedorId: vendedorComum.id,
        dataVenda: new Date(Date.now() + 7 * 86400000).toISOString(), statusEnvio: 'ABERTO',
        tipoPagamento: condPrazo.tipoPagamento, opcaoCondicaoPagamento: condPrazo.opcaoCondicao,
        nomeCondicaoPagamento: condPrazo.nomeCondicao,
        itens: [{ produtoId: produto.id, quantidade: 1, valor: 50, valorBase: 50 }]
    }, tokenVend);

    const seloNaListagem = async (nomeCliente, uuid) => {
        const r = await api('GET', `/api/clientes?search=${encodeURIComponent(nomeCliente)}&limit=5`);
        return (r.body?.data || []).find(c => c.UUID === uuid) || null;
    };

    // (a) faturado no app — situacaoCA NULL
    const t34a = await criarDevedorLocal('CLI34A', null);
    const ped34a = await prisma.pedido.findUnique({ where: { id: t34a.pedido.id }, select: { situacaoCA: true } });
    ok('(a) cenário montado: pedido local com situacaoCA NULL', ped34a.situacaoCA === null, `situacaoCA=${ped34a.situacaoCA}`);
    const venda34a = await tentarVenderAPrazo(t34a.cli.UUID);
    if (venda34a.body?.id) criados.pedidos.push(venda34a.body.id);
    ok('(a) venda a prazo BLOQUEADA (403) para devedor de pedido faturado no app',
        venda34a.status === 403 && /contas em aberto/i.test(venda34a.body?.error || ''),
        `${venda34a.status} ${venda34a.body?.error || ''}`);
    const ficha34a = await api('GET', `/api/clientes/${t34a.cli.UUID}/inadimplencia`);
    ok('(a) ficha do cliente acusa o atraso (R$ 300)',
        ficha34a.body?.inadimplente === true && Math.abs(num(ficha34a.body?.totalVencido) - 300) < 0.01,
        `inadimplente=${ficha34a.body?.inadimplente} totalVencido=${ficha34a.body?.totalVencido} contas=${(ficha34a.body?.contas || []).length}`);
    const selo34a = await seloNaListagem(`${MARCA} CLI34A`, t34a.cli.UUID);
    ok('(a) selo de inadimplente na listagem',
        !!selo34a?.inadimplente && Math.abs(num(selo34a?.totalVencido) - 300) < 0.01,
        JSON.stringify({ inadimplente: selo34a?.inadimplente, totalVencido: selo34a?.totalVencido }));

    // (b) controle: o caso que já funcionava (situacaoCA = 'FATURADO') não regrediu
    const t34b = await criarDevedorLocal('CLI34B', 'FATURADO');
    const venda34b = await tentarVenderAPrazo(t34b.cli.UUID);
    if (venda34b.body?.id) criados.pedidos.push(venda34b.body.id);
    ok('(b) controle: situacaoCA=FATURADO continua bloqueando (sem regressão)',
        venda34b.status === 403, `${venda34b.status} ${venda34b.body?.error || ''}`);
    const ficha34b = await api('GET', `/api/clientes/${t34b.cli.UUID}/inadimplencia`);
    ok('(b) controle: ficha continua acusando R$ 300',
        ficha34b.body?.inadimplente === true && Math.abs(num(ficha34b.body?.totalVencido) - 300) < 0.01,
        `inadimplente=${ficha34b.body?.inadimplente} totalVencido=${ficha34b.body?.totalVencido}`);

    // (b2) controle negativo: pedido CANCELADO no CA continua fora (o filtro não virou "tudo passa")
    const t34cancel = await criarDevedorLocal('CLI34D', 'CANCELADO');
    const venda34cancel = await tentarVenderAPrazo(t34cancel.cli.UUID);
    if (venda34cancel.body?.id) criados.pedidos.push(venda34cancel.body.id);
    const ficha34cancel = await api('GET', `/api/clientes/${t34cancel.cli.UUID}/inadimplencia`);
    ok('(b2) pedido CANCELADO no CA continua NÃO gerando inadimplência',
        venda34cancel.status !== 403 && !/contas em aberto/i.test(venda34cancel.body?.error || '')
        && num(ficha34cancel.body?.totalVencido) === 0,
        `venda=${venda34cancel.status} totalVencido=${ficha34cancel.body?.totalVencido}`);

    // (c) especial pago em dinheiro aguardando conferência (também com situacaoCA null):
    //     o filtro corrigido ENXERGA o título, e a proteção da conferência é quem o mantém fora
    const cli34c = await prisma.cliente.create({
        data: {
            UUID: `${MARCA}-CLI34C`, Nome: `${MARCA} CLI34C`, NomeFantasia: `${MARCA} CLI34C`,
            Condicao_de_pagamento: 'AVISTA_DIN'
        }
    });
    const t34c = await criarPedido({ valor: 450, condicao: condDinheiro, clienteUuid: cli34c.UUID });
    await prisma.pedidoPagamentoReal.create({
        data: { pedidoId: t34c.pedido.id, formaPagamentoNome: FORMA_OK, valor: 450 }
    });
    await prisma.pedido.update({
        where: { id: t34c.pedido.id },
        data: { statusEntrega: 'ENTREGUE', dataEntrega: dataEntregaTeste }
    });
    await prisma.parcela.updateMany({
        where: { contaReceberId: t34c.conta.id },
        data: { dataVencimento: new Date(Date.now() - 10 * 86400000) }
    });
    // o título PASSA no filtro corrigido (não é mais descartado pelo situacaoCA null)...
    const visivelNoFiltro = await prisma.contaReceber.findFirst({
        where: {
            id: t34c.conta.id,
            OR: [
                { pedidoId: null },
                { pedido: { statusEnvio: { not: 'EXCLUIDO' }, OR: [{ situacaoCA: null }, { situacaoCA: { not: 'CANCELADO' } }] } }
            ]
        },
        select: { id: true }
    });
    ok('(c) o título aguardando conferência É visto pelo filtro corrigido', !!visivelNoFiltro);
    // ...e mesmo assim NÃO vira inadimplência, porque a conferência do Caixa protege
    const venda34c = await tentarVenderAPrazo(cli34c.UUID);
    if (venda34c.body?.id) criados.pedidos.push(venda34c.body.id);
    ok('(c) quem pagou em dinheiro e aguarda conferência NÃO é bloqueado',
        venda34c.status !== 403 && !/contas em aberto/i.test(venda34c.body?.error || ''),
        `${venda34c.status} ${venda34c.body?.error || ''}`);
    const ficha34c = await api('GET', `/api/clientes/${cli34c.UUID}/inadimplencia`);
    ok('(c) ficha não acusa atraso para quem já pagou',
        ficha34c.body?.inadimplente !== true && num(ficha34c.body?.totalVencido) === 0,
        `inadimplente=${ficha34c.body?.inadimplente} totalVencido=${ficha34c.body?.totalVencido}`);
    const selo34c = await seloNaListagem(`${MARCA} CLI34C`, cli34c.UUID);
    ok('(c) sem selo de inadimplente na listagem para quem já pagou',
        selo34c && !selo34c.inadimplente, JSON.stringify({ achou: !!selo34c, inadimplente: selo34c?.inadimplente }));


    console.log(`\n=== ${falhas === 0 ? 'TODOS OS TESTES PASSARAM' : `${falhas} FALHA(S)`} ===\n`);
}

async function limpar() {
    try {
        const clientes = await prisma.cliente.findMany({
            where: { Nome: { startsWith: 'TESTE-BXESP' } }, select: { UUID: true }
        });
        const ids = clientes.map(c => c.UUID);
        const pedidos = await prisma.pedido.findMany({ where: { clienteId: { in: ids } }, select: { id: true } });
        const pids = [...new Set([...pedidos.map(p => p.id), ...criados.pedidos])];
        const devs = await prisma.devolucao.findMany({ where: { pedidoOriginalId: { in: pids } }, select: { id: true } });
        await prisma.devolucaoItem.deleteMany({ where: { devolucaoId: { in: devs.map(d => d.id) } } });
        await prisma.devolucao.deleteMany({ where: { id: { in: devs.map(d => d.id) } } });
        await prisma.pagamentoParcela.deleteMany({ where: { parcela: { contaReceber: { clienteId: { in: ids } } } } });
        await prisma.parcela.deleteMany({ where: { contaReceber: { clienteId: { in: ids } } } });
        await prisma.contaReceber.deleteMany({ where: { clienteId: { in: ids } } });
        await prisma.pedidoPagamentoReal.deleteMany({ where: { pedidoId: { in: pids } } });
        await prisma.entregaItemDevolvido.deleteMany({ where: { pedidoId: { in: pids } } });
        await prisma.pedidoItem.deleteMany({ where: { pedidoId: { in: pids } } });
        await prisma.movimentacaoEstoque.deleteMany({ where: { pedidoId: { in: pids } } });
        await prisma.atendimento.deleteMany({ where: { clienteId: { in: ids } } });
        await prisma.pedido.deleteMany({ where: { id: { in: pids } } });
        await prisma.cliente.deleteMany({ where: { UUID: { in: ids } } });
        const vend = await prisma.vendedor.findMany({ where: { nome: { startsWith: 'TESTE-BXESP' } }, select: { id: true } });
        const vids = vend.map(v => v.id);
        await prisma.caixaDiario.deleteMany({ where: { vendedorId: { in: vids } } });
        await prisma.embarque.deleteMany({ where: { responsavelId: { in: vids } } });
        await prisma.vendedor.deleteMany({ where: { id: { in: vids } } });
        const sobrou = await prisma.cliente.count({ where: { Nome: { startsWith: 'TESTE-BXESP' } } });
        if (sobrou > 0) console.error(`ATENÇÃO: sobraram ${sobrou} cliente(s) de teste no banco.`);
    } catch (e) {
        console.error('Falha na limpeza:', e.message);
    }
}

main()
    .catch((e) => { console.error('ERRO NO TESTE:', e); falhas++; })
    .finally(async () => {
        await limpar();
        if (servidor) servidor.close();
        await prisma.$disconnect();
        process.exit(falhas === 0 ? 0 : 1);
    });
