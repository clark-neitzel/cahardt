/**
 * Teste do PAPEL do responsável pela cobrança (fatia 1 — 08/2026), contra o banco LOCAL,
 * exercitando as rotas de verdade (entregas → contas a receber) num express de teste.
 *
 * Prova:
 *   (a) checkout do motorista grava responsavelPapel = MOTORISTA com a pessoa LOGADA;
 *   (b) id de terceiro mandado no payload é IGNORADO (não aceito) — a dívida fica com quem
 *       está logado;
 *   (c) o motorista marca os TRÊS papéis no checkout (inclusive VENDEDOR, com a pessoa
 *       vindo do payload) — mas pessoa inativa/inexistente/ausente e papel inválido = 400;
 *   (d) marcação LEGADA (papel vazio, como as 44 do banco) continua sendo lida como
 *       VENDEDOR / ESCRITORIO em /contas-receber e /por-responsavel;
 *   (e) editar o valor pela Auditoria PRESERVA o papel (não rebaixa MOTORISTA p/ vendedor);
 *   (f) pessoa inexistente/inativa é recusada; papel inválido é recusado;
 *   (g) linha de MOTORISTA aparece no menu /responsaveis, no filtro e no /por-responsavel;
 *   (h) responsável continua SEM QUITAR o título (regra do dono: sem banco não há quitação);
 *   (i) responsável que ficou INATIVO não trava a correção de valor pela Auditoria, mas
 *       MUDAR a marcação para alguém inativo continua sendo recusado.
 *
 * Cria e APAGA os próprios dados (prefixo TESTE-PAPEL).
 * ⛔ SÓ RODA NO BANCO LOCAL (trava em exigir-banco-local.js).
 *
 * Rodar: JWT_SECRET=... node backend/scripts/teste-papel-responsavel.js
 */
require('dotenv').config();
require('./exigir-banco-local')('teste-papel-responsavel.js');

const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../config/database');
const JWT_SECRET = require('../config/jwtSecret');

const MARCA = `TESTE-PAPEL-${Date.now()}`;
let falhas = 0;
const ok = (rotulo, cond, extra = '') => {
    console.log(`  ${cond ? '✅' : '❌'} ${rotulo}${extra ? ` — ${extra}` : ''}`);
    if (!cond) falhas++;
};

let servidor, base, motorista, vendedor, inativo, escritorio, cliente, produto, condDinheiro;
let tokenMotorista, tokenEscritorio;
const criados = { pedidos: [], contas: [], embarques: [] };

async function subirServidor() {
    const app = express();
    app.use(express.json());
    app.use('/api/entregas', require('../routes/entregas'));
    app.use('/api/contas-receber', require('../routes/contasReceber'));
    await new Promise((r) => { servidor = app.listen(0, r); });
    base = `http://127.0.0.1:${servidor.address().port}`;
}

const api = async (metodo, rota, corpo, tk) => {
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
    condDinheiro = await prisma.tabelaPreco.findFirst({
        where: { ativo: true, permiteEspecial: true, nomeCondicao: 'À vista - Dinheiro' }
    });
    if (!condDinheiro) throw new Error('Condição "À vista - Dinheiro" não encontrada no banco local.');

    motorista = await prisma.vendedor.create({
        data: { id: `${MARCA}-MOT`, nome: `${MARCA} Motorista`, permissoes: { admin: true } }
    });
    vendedor = await prisma.vendedor.create({
        data: { id: `${MARCA}-VEN`, nome: `${MARCA} Vendedor`, permissoes: {} }
    });
    inativo = await prisma.vendedor.create({
        data: { id: `${MARCA}-INA`, nome: `${MARCA} Inativo`, ativo: false, permissoes: {} }
    });
    escritorio = await prisma.vendedor.create({
        data: { id: `${MARCA}-ESC`, nome: `${MARCA} Escritorio`, permissoes: { admin: true } }
    });
    cliente = await prisma.cliente.create({
        data: {
            UUID: `${MARCA}-CLI`, Nome: `${MARCA} Cliente`, NomeFantasia: `${MARCA} Cliente`,
            Condicao_de_pagamento: 'AVISTA_DIN'
        }
    });
    tokenMotorista = jwt.sign({ id: motorista.id, nome: motorista.nome }, JWT_SECRET, { expiresIn: '1h' });
    tokenEscritorio = jwt.sign({ id: escritorio.id, nome: escritorio.nome }, JWT_SECRET, { expiresIn: '1h' });
}

async function criarPedido({ valor }) {
    const embarque = await prisma.embarque.create({
        data: { dataSaida: new Date(), responsavelId: motorista.id }
    });
    criados.embarques.push(embarque.id);
    const pedido = await prisma.pedido.create({
        data: {
            dataVenda: new Date(), clienteId: cliente.UUID, vendedorId: motorista.id,
            especial: true, embarqueId: embarque.id, statusEntrega: 'PENDENTE',
            tipoPagamento: condDinheiro.tipoPagamento,
            opcaoCondicaoPagamento: condDinheiro.opcaoCondicao,
            nomeCondicaoPagamento: condDinheiro.nomeCondicao,
            primeiroVencimento: new Date(),
            itens: { create: [{ produtoId: produto.id, quantidade: 1, valor, valorBase: valor }] }
        }
    });
    criados.pedidos.push(pedido.id);
    const conta = await prisma.contaReceber.create({
        data: {
            pedidoId: pedido.id, clienteId: cliente.UUID, origem: 'ESPECIAL',
            valorTotal: valor, status: 'ABERTO',
            parcelas: { create: [{ numeroParcela: 1, valor, dataVencimento: new Date(), status: 'PENDENTE' }] }
        },
        include: { parcelas: true }
    });
    criados.contas.push(conta.id);
    return { pedido, conta };
}

const linhas = (pedidoId) => prisma.pedidoPagamentoReal.findMany({
    where: { pedidoId },
    select: {
        formaPagamentoNome: true, valor: true,
        responsavelPapel: true, vendedorResponsavelId: true, escritorioResponsavel: true
    }
});
const FORMA = () => condDinheiro.nomeCondicao;

async function main() {
    console.log(`\n=== ${MARCA} ===`);
    await subirServidor();
    await seedBase();

    // ── (a) checkout do motorista grava MOTORISTA com a pessoa logada ────────────────
    console.log('\n[a] Checkout do motorista → papel MOTORISTA com a pessoa LOGADA');
    const ta = await criarPedido({ valor: 200 });
    const ra = await api('POST', `/api/entregas/${ta.pedido.id}/concluir`, {
        statusEntrega: 'ENTREGUE',
        pagamentos: [{ formaPagamentoNome: FORMA(), valor: 200, responsavelPapel: 'MOTORISTA' }]
    }, tokenMotorista);
    ok('checkout aceito', ra.status === 200, JSON.stringify(ra.body));
    const la = await linhas(ta.pedido.id);
    ok('papel gravado = MOTORISTA', la[0]?.responsavelPapel === 'MOTORISTA', `papel=${la[0]?.responsavelPapel}`);
    ok('pessoa = o motorista logado', la[0]?.vendedorResponsavelId === motorista.id, `pessoa=${la[0]?.vendedorResponsavelId}`);
    ok('escritorioResponsavel continua false', la[0]?.escritorioResponsavel === false);

    // ── (b) id de terceiro no payload é IGNORADO ─────────────────────────────────────
    console.log('\n[b] Id de TERCEIRO no payload (Postman) é ignorado, não aceito');
    const tb = await criarPedido({ valor: 150 });
    const rb = await api('POST', `/api/entregas/${tb.pedido.id}/concluir`, {
        statusEntrega: 'ENTREGUE',
        pagamentos: [{
            formaPagamentoNome: FORMA(), valor: 150,
            responsavelPapel: 'MOTORISTA',
            vendedorResponsavelId: vendedor.id   // ← tentativa de pendurar em outra pessoa
        }]
    }, tokenMotorista);
    ok('checkout aceito (não estoura)', rb.status === 200, JSON.stringify(rb.body));
    const lb = await linhas(tb.pedido.id);
    ok('a dívida ficou com QUEM ESTÁ LOGADO', lb[0]?.vendedorResponsavelId === motorista.id, `pessoa=${lb[0]?.vendedorResponsavelId}`);
    ok('o id de terceiro NÃO foi gravado', lb[0]?.vendedorResponsavelId !== vendedor.id);

    // payload LEGADO (sem papel), como o frontend manda hoje: vira MOTORISTA logado
    console.log('\n[b2] Payload legado do app atual (só vendedorResponsavelId) vira MOTORISTA logado');
    const tb2 = await criarPedido({ valor: 90 });
    const rb2 = await api('POST', `/api/entregas/${tb2.pedido.id}/concluir`, {
        statusEntrega: 'ENTREGUE',
        pagamentos: [{ formaPagamentoNome: FORMA(), valor: 90, vendedorResponsavelId: vendedor.id }]
    }, tokenMotorista);
    ok('checkout aceito', rb2.status === 200, JSON.stringify(rb2.body));
    const lb2 = await linhas(tb2.pedido.id);
    ok('papel derivado = MOTORISTA', lb2[0]?.responsavelPapel === 'MOTORISTA', `papel=${lb2[0]?.responsavelPapel}`);
    ok('pessoa = o logado (terceiro ignorado)', lb2[0]?.vendedorResponsavelId === motorista.id, `pessoa=${lb2[0]?.vendedorResponsavelId}`);

    // ── (c) o motorista pode marcar os TRÊS papéis no checkout ──────────────────────
    // Decisão do dono (08/2026): "sim, inclusive a dele" — quem controla é a APROVAÇÃO
    // de quem confere o caixa, não uma trava na hora de marcar.
    console.log('\n[c] Checkout aceita os TRÊS papéis — inclusive VENDEDOR');
    const tc = await criarPedido({ valor: 120 });
    const rc = await api('POST', `/api/entregas/${tc.pedido.id}/concluir`, {
        statusEntrega: 'ENTREGUE',
        pagamentos: [{ formaPagamentoNome: FORMA(), valor: 120, responsavelPapel: 'VENDEDOR', vendedorResponsavelId: vendedor.id }]
    }, tokenMotorista);
    ok('checkout com papel VENDEDOR ACEITO (200)', rc.status === 200, `${rc.status} ${rc.body?.error || ''}`);
    const lcv = await linhas(tc.pedido.id);
    ok('papel gravado = VENDEDOR', lcv[0]?.responsavelPapel === 'VENDEDOR', `papel=${lcv[0]?.responsavelPapel}`);
    ok('pessoa = o VENDEDOR escolhido (não o motorista logado)',
        lcv[0]?.vendedorResponsavelId === vendedor.id, `pessoa=${lcv[0]?.vendedorResponsavelId}`);
    ok('não caiu no motorista logado', lcv[0]?.vendedorResponsavelId !== motorista.id);

    // ESCRITORIO no checkout
    const tcEsc = await criarPedido({ valor: 60 });
    const rcEsc = await api('POST', `/api/entregas/${tcEsc.pedido.id}/concluir`, {
        statusEntrega: 'ENTREGUE',
        pagamentos: [{ formaPagamentoNome: FORMA(), valor: 60, responsavelPapel: 'ESCRITORIO' }]
    }, tokenMotorista);
    ok('checkout com papel ESCRITORIO aceito (200)', rcEsc.status === 200, `${rcEsc.status} ${rcEsc.body?.error || ''}`);
    const lcEsc = (await linhas(tcEsc.pedido.id))[0];
    ok('papel = ESCRITORIO, sem pessoa', lcEsc?.responsavelPapel === 'ESCRITORIO'
        && lcEsc?.vendedorResponsavelId === null && lcEsc?.escritorioResponsavel === true,
        `papel=${lcEsc?.responsavelPapel} pessoa=${lcEsc?.vendedorResponsavelId} esc=${lcEsc?.escritorioResponsavel}`);

    // ── (c2) mesmo aceitando os três, a VALIDAÇÃO da pessoa continua no checkout ─────
    console.log('\n[c2] Checkout: VENDEDOR inativo / inexistente / sem pessoa → 400');
    const tc2 = await criarPedido({ valor: 80 });
    const rcIna = await api('POST', `/api/entregas/${tc2.pedido.id}/concluir`, {
        statusEntrega: 'ENTREGUE',
        pagamentos: [{ formaPagamentoNome: FORMA(), valor: 80, responsavelPapel: 'VENDEDOR', vendedorResponsavelId: inativo.id }]
    }, tokenMotorista);
    ok('vendedor INATIVO recusado (400)', rcIna.status === 400, `${rcIna.status} ${rcIna.body?.error || ''}`);
    const rcFan = await api('POST', `/api/entregas/${tc2.pedido.id}/concluir`, {
        statusEntrega: 'ENTREGUE',
        pagamentos: [{ formaPagamentoNome: FORMA(), valor: 80, responsavelPapel: 'VENDEDOR', vendedorResponsavelId: 'NAO-EXISTE-999' }]
    }, tokenMotorista);
    ok('vendedor INEXISTENTE recusado (400)', rcFan.status === 400, `${rcFan.status} ${rcFan.body?.error || ''}`);
    const rcSem = await api('POST', `/api/entregas/${tc2.pedido.id}/concluir`, {
        statusEntrega: 'ENTREGUE',
        pagamentos: [{ formaPagamentoNome: FORMA(), valor: 80, responsavelPapel: 'VENDEDOR' }]
    }, tokenMotorista);
    ok('papel VENDEDOR SEM pessoa recusado (400)', rcSem.status === 400, `${rcSem.status} ${rcSem.body?.error || ''}`);
    const rcPap = await api('POST', `/api/entregas/${tc2.pedido.id}/concluir`, {
        statusEntrega: 'ENTREGUE',
        pagamentos: [{ formaPagamentoNome: FORMA(), valor: 80, responsavelPapel: 'GERENTE', vendedorResponsavelId: vendedor.id }]
    }, tokenMotorista);
    ok('papel INVÁLIDO recusado no checkout (400)', rcPap.status === 400, `${rcPap.status} ${rcPap.body?.error || ''}`);
    ok('depois das 4 recusas a entrega continua sem nenhum pagamento gravado',
        (await linhas(tc2.pedido.id)).length === 0, 'nenhuma linha');
    const pedidoIntacto = await prisma.pedido.findUnique({ where: { id: tc2.pedido.id }, select: { statusEntrega: true } });
    ok('e a entrega continua PENDENTE (recusa não conclui a entrega)',
        pedidoIntacto?.statusEntrega === 'PENDENTE', `statusEntrega=${pedidoIntacto?.statusEntrega}`);

    // ── (c3) Auditoria continua aceitando VENDEDOR (reclassificação pelo escritório) ──
    console.log('\n[c3] Auditoria reclassifica MOTORISTA → VENDEDOR');
    const tc3 = await criarPedido({ valor: 120 });
    await api('POST', `/api/entregas/${tc3.pedido.id}/concluir`, {
        statusEntrega: 'ENTREGUE',
        pagamentos: [{ formaPagamentoNome: FORMA(), valor: 120, responsavelPapel: 'MOTORISTA' }]
    }, tokenMotorista);
    const rc2 = await api('PATCH', `/api/entregas/${tc3.pedido.id}/editar`, {
        pagamentos: [{ formaPagamentoNome: FORMA(), valor: 120, responsavelPapel: 'VENDEDOR', vendedorResponsavelId: vendedor.id }]
    }, tokenEscritorio);
    ok('Auditoria ACEITA papel VENDEDOR (200)', rc2.status === 200, `${rc2.status} ${JSON.stringify(rc2.body)}`);
    const lc = await linhas(tc3.pedido.id);
    ok('papel virou VENDEDOR', lc[0]?.responsavelPapel === 'VENDEDOR', `papel=${lc[0]?.responsavelPapel}`);
    ok('pessoa = o vendedor escolhido pelo escritório', lc[0]?.vendedorResponsavelId === vendedor.id);

    // ── (e) editar VALOR pela Auditoria preserva o papel ─────────────────────────────
    console.log('\n[e] Auditoria corrige o VALOR sem falar de responsável → papel PRESERVADO');
    const te = await criarPedido({ valor: 400 });
    await api('POST', `/api/entregas/${te.pedido.id}/concluir`, {
        statusEntrega: 'ENTREGUE',
        pagamentos: [{ formaPagamentoNome: FORMA(), valor: 400, responsavelPapel: 'MOTORISTA' }]
    }, tokenMotorista);
    const antesE = (await linhas(te.pedido.id))[0];
    const re = await api('PATCH', `/api/entregas/${te.pedido.id}/editar`, {
        // formulário do escritório: só forma + valor, como a tela manda hoje
        pagamentos: [{ formaPagamentoNome: FORMA(), valor: 380 }]
    }, tokenEscritorio);
    ok('edição aceita', re.status === 200, JSON.stringify(re.body));
    const depoisE = (await linhas(te.pedido.id))[0];
    ok('valor foi corrigido', Number(depoisE?.valor) === 380, `valor=${depoisE?.valor}`);
    ok('papel continua MOTORISTA (não rebaixou p/ vendedor)', depoisE?.responsavelPapel === 'MOTORISTA', `antes=${antesE?.responsavelPapel} depois=${depoisE?.responsavelPapel}`);
    ok('pessoa preservada', depoisE?.vendedorResponsavelId === motorista.id);

    // marcação LEGADA (papel vazio) herdada numa edição não pode ganhar papel carimbado
    console.log('\n[e2] Marcação LEGADA herdada numa edição continua LEGADA (papel vazio)');
    const te2 = await criarPedido({ valor: 250 });
    await prisma.pedidoPagamentoReal.create({
        data: {
            pedidoId: te2.pedido.id, formaPagamentoNome: FORMA(), valor: 250,
            vendedorResponsavelId: vendedor.id   // como estão as 44 do banco: sem papel
        }
    });
    await prisma.pedido.update({ where: { id: te2.pedido.id }, data: { statusEntrega: 'ENTREGUE' } });
    const re2 = await api('PATCH', `/api/entregas/${te2.pedido.id}/editar`, {
        pagamentos: [{ formaPagamentoNome: FORMA(), valor: 240 }]
    }, tokenEscritorio);
    ok('edição aceita', re2.status === 200, JSON.stringify(re2.body));
    const depoisE2 = (await linhas(te2.pedido.id))[0];
    ok('papel continua VAZIO (não foi carimbado por cima)', depoisE2?.responsavelPapel === null, `papel=${depoisE2?.responsavelPapel}`);
    ok('pessoa preservada', depoisE2?.vendedorResponsavelId === vendedor.id);

    // ── (f) recusas: pessoa inativa, pessoa inexistente, papel inválido ──────────────
    console.log('\n[f] Recusas: pessoa inativa, pessoa inexistente, papel inválido');
    const tf = await criarPedido({ valor: 100 });
    await api('POST', `/api/entregas/${tf.pedido.id}/concluir`, {
        statusEntrega: 'ENTREGUE', pagamentos: [{ formaPagamentoNome: FORMA(), valor: 100, responsavelPapel: 'MOTORISTA' }]
    }, tokenMotorista);
    const rfInativo = await api('PATCH', `/api/entregas/${tf.pedido.id}/editar`, {
        pagamentos: [{ formaPagamentoNome: FORMA(), valor: 100, responsavelPapel: 'VENDEDOR', vendedorResponsavelId: inativo.id }]
    }, tokenEscritorio);
    ok('pessoa INATIVA recusada (400)', rfInativo.status === 400, `${rfInativo.status} ${rfInativo.body?.error || ''}`);
    const rfFantasma = await api('PATCH', `/api/entregas/${tf.pedido.id}/editar`, {
        pagamentos: [{ formaPagamentoNome: FORMA(), valor: 100, responsavelPapel: 'VENDEDOR', vendedorResponsavelId: 'NAO-EXISTE-999' }]
    }, tokenEscritorio);
    ok('pessoa INEXISTENTE recusada (400)', rfFantasma.status === 400, `${rfFantasma.status} ${rfFantasma.body?.error || ''}`);
    const rfPapel = await api('PATCH', `/api/entregas/${tf.pedido.id}/editar`, {
        pagamentos: [{ formaPagamentoNome: FORMA(), valor: 100, responsavelPapel: 'GERENTE', vendedorResponsavelId: vendedor.id }]
    }, tokenEscritorio);
    ok('papel INVÁLIDO recusado (400)', rfPapel.status === 400, `${rfPapel.status} ${rfPapel.body?.error || ''}`);
    const lf = (await linhas(tf.pedido.id))[0];
    ok('depois das 3 recusas a marcação original continua intacta', lf?.responsavelPapel === 'MOTORISTA' && lf?.vendedorResponsavelId === motorista.id, `papel=${lf?.responsavelPapel}`);

    // ── (i) pessoa INATIVA: manter a marcação pode; MUDAR para inativo não ──────────
    // Defeito achado pelo revisor: a Auditoria manda `responsavelPapel` em toda linha,
    // então corrigir só o VALOR de uma entrega cujo responsável saiu da empresa devolvia
    // 400 — e a única saída era reatribuir ou tirar o responsável, justo o que esta fatia
    // existe para impedir. É exatamente quando alguém sai que a dívida é auditada.
    console.log('\n[i] Responsável que ficou INATIVO não trava a correção de valor');
    const ti = await criarPedido({ valor: 300 });
    await api('POST', `/api/entregas/${ti.pedido.id}/concluir`, {
        statusEntrega: 'ENTREGUE',
        pagamentos: [{ formaPagamentoNome: FORMA(), valor: 300, responsavelPapel: 'VENDEDOR', vendedorResponsavelId: vendedor.id }]
    }, tokenMotorista);
    // o vendedor sai da empresa DEPOIS de já estar marcado
    await prisma.vendedor.update({ where: { id: vendedor.id }, data: { ativo: false } });

    // (a) corrigir SÓ o valor — a tela manda o papel junto, como a Auditoria faz de verdade
    const ri = await api('PATCH', `/api/entregas/${ti.pedido.id}/editar`, {
        pagamentos: [{
            formaPagamentoNome: FORMA(), valor: 280,
            responsavelPapel: 'VENDEDOR', vendedorResponsavelId: vendedor.id
        }]
    }, tokenEscritorio);
    ok('(a) corrigir o VALOR com responsável inativo é ACEITO (200)', ri.status === 200,
        `${ri.status} ${ri.body?.error || ''}`);
    const li = (await linhas(ti.pedido.id))[0];
    ok('(a) valor corrigido', Number(li?.valor) === 280, `valor=${li?.valor}`);
    ok('(a) marcação intacta (mesmo papel, mesma pessoa inativa)',
        li?.responsavelPapel === 'VENDEDOR' && li?.vendedorResponsavelId === vendedor.id,
        `papel=${li?.responsavelPapel} pessoa=${li?.vendedorResponsavelId}`);

    // (a2) a herança pura (sem falar de responsável) também continua passando
    const ri2 = await api('PATCH', `/api/entregas/${ti.pedido.id}/editar`, {
        pagamentos: [{ formaPagamentoNome: FORMA(), valor: 270 }]
    }, tokenEscritorio);
    ok('(a2) edição por herança com pessoa inativa aceita (200)', ri2.status === 200, `${ri2.status} ${ri2.body?.error || ''}`);
    const li2 = (await linhas(ti.pedido.id))[0];
    ok('(a2) marcação inativa preservada', li2?.vendedorResponsavelId === vendedor.id && Number(li2?.valor) === 270,
        `pessoa=${li2?.vendedorResponsavelId} valor=${li2?.valor}`);

    // (b) MUDAR para uma pessoa inativa que NÃO estava no pedido continua sendo 400
    const ri3 = await api('PATCH', `/api/entregas/${ti.pedido.id}/editar`, {
        pagamentos: [{
            formaPagamentoNome: FORMA(), valor: 270,
            responsavelPapel: 'VENDEDOR', vendedorResponsavelId: inativo.id
        }]
    }, tokenEscritorio);
    ok('(b) MUDAR para outra pessoa inativa é RECUSADO (400)', ri3.status === 400,
        `${ri3.status} ${ri3.body?.error || ''}`);
    const li3 = (await linhas(ti.pedido.id))[0];
    ok('(b) a marcação anterior continua intacta após a recusa',
        li3?.vendedorResponsavelId === vendedor.id, `pessoa=${li3?.vendedorResponsavelId}`);

    // (c) no CHECKOUT a pessoa é sempre nova → inativo continua recusado
    const ti2 = await criarPedido({ valor: 110 });
    const ri4 = await api('POST', `/api/entregas/${ti2.pedido.id}/concluir`, {
        statusEntrega: 'ENTREGUE',
        pagamentos: [{ formaPagamentoNome: FORMA(), valor: 110, responsavelPapel: 'VENDEDOR', vendedorResponsavelId: vendedor.id }]
    }, tokenMotorista);
    ok('(c) checkout continua RECUSANDO pessoa inativa (400)', ri4.status === 400,
        `${ri4.status} ${ri4.body?.error || ''}`);
    ok('(c) nada gravado no checkout recusado', (await linhas(ti2.pedido.id)).length === 0);

    // devolve o vendedor ao estado ativo para não contaminar os blocos seguintes
    await prisma.vendedor.update({ where: { id: vendedor.id }, data: { ativo: true } });

    // ── (g) leitura: menu, filtro e fechamento enxergam o MOTORISTA ──────────────────
    console.log('\n[g] Contas a Receber enxerga a família MOTORISTA');
    const menu = await api('GET', '/api/contas-receber/responsaveis', null, tokenEscritorio);
    const opcaoMot = (menu.body?.responsaveis || []).find(r => r.tipo === 'MOTORISTA' && r.pessoaId === motorista.id);
    ok('menu /responsaveis traz a opção MOTORISTA', !!opcaoMot, JSON.stringify(opcaoMot));
    ok('valor da opção vem prefixado', opcaoMot?.valor === `MOTORISTA:${motorista.id}`, opcaoMot?.valor);
    ok('label diz que é motorista', /motorista/i.test(opcaoMot?.label || ''), opcaoMot?.label);

    const listaMot = await api('GET', `/api/contas-receber?limit=500&responsaveis=${encodeURIComponent(opcaoMot?.valor || '')}`, null, tokenEscritorio);
    const contasMot = listaMot.body?.contas || listaMot.body || [];
    const dosNossos = contasMot.filter(c => criados.contas.includes(c.id));
    ok('filtro por MOTORISTA devolve os títulos deste motorista', dosNossos.length >= 3, `${dosNossos.length} conta(s) do teste`);
    const tiposVistos = [...new Set(dosNossos.flatMap(c => (c.responsaveis || []).map(r => r.tipo)))];
    ok('a tela recebe tipo=MOTORISTA', tiposVistos.includes('MOTORISTA'), JSON.stringify(tiposVistos));
    const nomeMot = dosNossos.flatMap(c => c.responsaveis || []).find(r => r.tipo === 'MOTORISTA')?.pessoaNome;
    ok('nome do motorista resolvido (não "não identificado")', nomeMot === motorista.nome, `nome=${nomeMot}`);

    const fech = await api('GET', '/api/contas-receber/por-responsavel', null, tokenEscritorio);
    const gruposFech = fech.body?.responsaveis || [];
    const grupoMot = gruposFech.find(g => g.tipo === 'MOTORISTA' && g.pessoaId === motorista.id);
    ok('/por-responsavel abre um grupo próprio para o MOTORISTA', !!grupoMot,
        `saldo=${grupoMot?.saldoEmAberto} titulos=${grupoMot?.quantidadeTitulos}`);
    ok('o grupo do motorista tem saldo e títulos de verdade',
        Number(grupoMot?.saldoEmAberto) > 0 && grupoMot?.quantidadeTitulos > 0,
        `saldo=${grupoMot?.saldoEmAberto} titulos=${grupoMot?.quantidadeTitulos}`);
    // ⚠️ A chave do grupo já jogou MOTORISTA dentro do balde 'ESCRITORIO' (bug achado nesta
    // fatia). Aqui a prova é fina: NENHUM título de motorista pode aparecer no card do
    // Escritório — mas o título marcado como ESCRITORIO no checkout DEVE aparecer lá.
    const idsMotorista = dosNossos.map(c => c.id);
    const grupoEsc = gruposFech.find(g => g.tipo === 'ESCRITORIO');
    const vazadosNoEscritorio = (grupoEsc?.titulos || [])
        .filter(t => idsMotorista.includes(t.contaId))
        .map(t => t.contaId);
    ok('nenhum título de MOTORISTA vazou para o card do Escritório',
        vazadosNoEscritorio.length === 0, JSON.stringify(vazadosNoEscritorio));
    ok('o título marcado como ESCRITORIO no checkout está no card do Escritório',
        (grupoEsc?.titulos || []).some(t => t.contaId === tcEsc.conta.id),
        `conta=${tcEsc.conta.id}`);
    ok('o saldo do motorista bate com o que ele assumiu (não herdou valor do escritório)',
        Number(grupoMot?.saldoEmAberto) === 920, `saldo=${grupoMot?.saldoEmAberto} (200+150+90+380+100)`);
    const somaGrupos = (gruposFech).reduce((s, g) => s + Number(g.saldoEmAberto || 0), 0);
    ok('soma dos grupos = total geral do relatório (nada perdido no caminho)',
        Math.abs(somaGrupos - Number(fech.body?.totais?.valor ?? fech.body?.totais?.valorGeral ?? somaGrupos)) < 0.02,
        `soma=${somaGrupos.toFixed(2)} totais=${JSON.stringify(fech.body?.totais)}`);

    // ── (h) responsável NÃO quita o título ───────────────────────────────────────────
    console.log('\n[h] Marcar responsável não quita nada (sem banco não há quitação)');
    const contaA = await prisma.contaReceber.findUnique({
        where: { id: ta.conta.id }, include: { parcelas: { include: { pagamentos: true } } }
    });
    ok('conta continua ABERTO', contaA?.status === 'ABERTO', `status=${contaA?.status}`);
    ok('parcela continua PENDENTE', contaA?.parcelas[0]?.status === 'PENDENTE', `status=${contaA?.parcelas[0]?.status}`);
    ok('nenhuma linha de ledger criada', (contaA?.parcelas[0]?.pagamentos || []).length === 0);

    // ── (d) marcação LEGADA continua sendo lida igual ────────────────────────────────
    console.log('\n[d] Marcação LEGADA (papel vazio) — as 44 do banco — continua visível');
    const legadas = await prisma.pedidoPagamentoReal.findMany({
        where: {
            responsavelPapel: null, valor: { gt: 0 },
            OR: [{ vendedorResponsavelId: { not: null } }, { escritorioResponsavel: true }],
            pedidoId: { notIn: criados.pedidos }
        },
        select: { pedidoId: true, vendedorResponsavelId: true, escritorioResponsavel: true, valor: true }
    });
    ok('o banco local tem marcações legadas para conferir', legadas.length > 0, `${legadas.length} linha(s)`);
    const listaTudo = await api('GET', '/api/contas-receber?limit=2000', null, tokenEscritorio);
    const todas = listaTudo.body?.contas || listaTudo.body || [];
    const porPedido = new Map(todas.filter(c => c.pedidoId).map(c => [c.pedidoId, c]));
    let conferidas = 0, divergentes = [];
    for (const l of legadas) {
        const conta = porPedido.get(l.pedidoId);
        if (!conta) continue; // conta já quitada/fora da listagem — não é o alvo deste teste
        conferidas++;
        const esperado = l.vendedorResponsavelId ? 'VENDEDOR' : 'ESCRITORIO';
        const achou = (conta.responsaveis || []).some(r => r.tipo === esperado
            && (esperado === 'ESCRITORIO' || r.pessoaId === l.vendedorResponsavelId));
        if (!achou) divergentes.push({ pedidoId: l.pedidoId, esperado, veio: conta.responsaveis });
    }
    ok('legadas conferidas na listagem', conferidas > 0, `${conferidas} linha(s) legada(s) com conta na tela`);
    ok('TODAS as legadas continuam com o mesmo tipo/pessoa de antes', divergentes.length === 0, JSON.stringify(divergentes).slice(0, 300));

    console.log(falhas === 0 ? '\n=== TODOS OS TESTES PASSARAM ===' : `\n=== ${falhas} FALHA(S) ===`);
}

async function limpar() {
    try {
        const pids = criados.pedidos;
        await prisma.pagamentoParcela.deleteMany({ where: { parcela: { contaReceber: { clienteId: `${MARCA}-CLI` } } } });
        await prisma.parcela.deleteMany({ where: { contaReceber: { clienteId: `${MARCA}-CLI` } } });
        await prisma.contaReceber.deleteMany({ where: { clienteId: `${MARCA}-CLI` } });
        await prisma.pedidoPagamentoReal.deleteMany({ where: { pedidoId: { in: pids } } });
        await prisma.entregaItemDevolvido.deleteMany({ where: { pedidoId: { in: pids } } });
        await prisma.pedidoItem.deleteMany({ where: { pedidoId: { in: pids } } });
        await prisma.movimentacaoEstoque.deleteMany({ where: { pedidoId: { in: pids } } });
        await prisma.atendimento.deleteMany({ where: { clienteId: `${MARCA}-CLI` } });
        await prisma.pedido.deleteMany({ where: { id: { in: pids } } });
        await prisma.cliente.deleteMany({ where: { UUID: `${MARCA}-CLI` } });
        await prisma.embarque.deleteMany({ where: { id: { in: criados.embarques } } });
        await prisma.vendedor.deleteMany({ where: { nome: { startsWith: MARCA } } });
        const sobrou = await prisma.pedidoPagamentoReal.count({ where: { pedidoId: { in: pids } } });
        if (sobrou > 0) console.error(`ATENÇÃO: sobraram ${sobrou} linha(s) de pagamento de teste.`);
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
