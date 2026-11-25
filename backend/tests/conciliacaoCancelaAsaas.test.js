// Conciliação bancária (entrada) quitando conta a receber → cancela o boleto/PIX que
// ficou aberto no Asaas (11/2026). Sem rede e sem banco: Prisma e asaasService são
// trocados por fakes em memória (NUNCA usa chave Asaas nem o banco de produção).
//
// Prova: (a) parcela quitada → cancelarCobrancasDaParcela com o id certo (e a do pedido
// quando a conta fecha); (b) baixa parcial → NÃO chama nada; (c) Asaas que lança erro →
// a conciliação continua OK (lançamento CONCILIADO, resposta de sucesso).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.JWT_SECRET = 'segredo-teste-conciliacao-0123456789abcdef';

const { stubModule, limparCacheContendo } = require('./helpers/mockPrisma');

const DB_MODULE = path.join(__dirname, '../config/database.js');
const ASAAS_MODULE = path.join(__dirname, '../services/asaasService.js');
const SERVICE = path.join(__dirname, '../services/conciliacaoBancariaService.js');

function criarBanco({ parcelas, cobrancas = [], pagamentosIniciais = [] }) {
    const db = {
        parcelas: parcelas.map((p) => ({ valorPago: 0, valorDescontoTotal: 0, status: 'PENDENTE', ...p })),
        contas: { c1: { id: 'c1', status: 'ABERTO', pedidoId: 'ped1', aguardandoConciliacao: false } },
        pagamentos: [...pagamentosIniciais],
        cobrancas: cobrancas.map((c) => ({ status: 'PENDENTE', ...c })),
        lancamentos: [{ id: 'l1', contaFinanceiraCaId: 'cf1', tipo: 'CREDITO', status: 'PENDENTE', valor: 100, data: '2026-11-20', descricao: 'PIX' }],
        opcoesTx: []
    };
    const comConta = (p) => (p ? { ...p, contaReceber: db.contas[p.contaReceberId] } : p);
    const parcela = {
        findMany: async ({ where }) => db.parcelas
            .filter((p) => (where.id ? where.id.in.includes(p.id) : p.contaReceberId === where.contaReceberId))
            .map(comConta),
        findUnique: async ({ where }) => {
            const p = db.parcelas.find((x) => x.id === where.id);
            return p ? { ...comConta(p), pagamentos: db.pagamentos.filter((g) => g.parcelaId === p.id && !g.estornado) } : null;
        },
        update: async ({ where, data }) => {
            const p = db.parcelas.find((x) => x.id === where.id);
            for (const [k, v] of Object.entries(data)) if (v !== undefined) p[k] = v;
            return p;
        }
    };
    const modelos = {
        parcela,
        contaFinanceira: { findUnique: async ({ where }) => ({ id: where.id, nomeBanco: 'Banco Teste' }) },
        cobrancaAsaas: {
            findMany: async ({ where }) => db.cobrancas.filter((c) => c.pedidoId === where.pedidoId && where.status.in.includes(c.status))
        },
        pagamentoParcela: {
            findUnique: async ({ where }) => db.pagamentos.find((g) => g.id === where.id) || null,
            update: async ({ where, data }) => Object.assign(db.pagamentos.find((g) => g.id === where.id), data),
            create: async ({ data }) => { const g = { id: `pg${db.pagamentos.length + 1}`, confirmado: true, estornado: false, ...data }; db.pagamentos.push(g); return g; },
            count: async () => 0,
            findMany: async () => []
        },
        contaReceber: { update: async ({ where, data }) => Object.assign(db.contas[where.id], data) },
        extratoLancamento: {
            findMany: async ({ where }) => (where.id ? db.lancamentos.filter((l) => where.id.in.includes(l.id)) : []),
            updateMany: async ({ where, data }) => {
                const ls = db.lancamentos.filter((l) => where.id.in ? where.id.in.includes(l.id) : l.id === where.id).filter((l) => l.status === where.status);
                ls.forEach((l) => Object.assign(l, data));
                return { count: ls.length };
            }
        },
        conciliacaoGrupo: { findMany: async () => [], create: async () => ({ id: 'g1' }) },
        conciliacaoGrupoItem: { createMany: async () => ({}) }
    };
    db.prisma = {
        ...modelos,
        $transaction: async (fn, opts) => { db.opcoesTx.push(opts); return fn(modelos); }
    };
    return db;
}

function carregar({ parcelas, asaas, cobrancas, pagamentosIniciais }) {
    const db = criarBanco({ parcelas, cobrancas, pagamentosIniciais });
    const restDb = stubModule(DB_MODULE, db.prisma);
    const restAsaas = stubModule(ASAAS_MODULE, asaas);
    limparCacheContendo('conciliacaoBancariaService');
    const svc = require(SERVICE);
    return { db, svc, restaurar: () => { restDb(); restAsaas(); limparCacheContendo('conciliacaoBancariaService'); } };
}

const PARCELA = { id: 'par1', contaReceberId: 'c1', valor: 100, dataVencimento: '2026-11-10' };

test('(a) parcela quitada pela conciliação → cancela cobranças da parcela e do pedido', async () => {
    const chamadas = [];
    const asaas = {
        cancelarCobrancasDaParcela: async (id, motivo) => { chamadas.push(['parcela', id, motivo]); return { canceladas: 1, erros: [] }; },
        cancelarCobrancasDoPedido: async (id, motivo) => { chamadas.push(['pedido', id, motivo]); return { canceladas: 1, erros: [] }; }
    };
    const { db, svc, restaurar } = carregar({ parcelas: [PARCELA], asaas, cobrancas: [{ id: 'cb2', asaasPaymentId: 'pay_qr_entrega', parcelaId: null, pedidoId: 'ped1' }] });
    try {
        const r = await svc.conciliarUnificado({ lancamentoIds: ['l1'], parcelaReceberIds: ['par1'], metodoPagamento: 'DEPOSITO_BANCARIO', userId: 'u1' });
        assert.equal(db.parcelas[0].status, 'PAGO');
        assert.equal(db.contas.c1.status, 'QUITADO');
        assert.equal(db.lancamentos[0].status, 'CONCILIADO');
        assert.deepEqual(chamadas.map((c) => c.slice(0, 2)), [['parcela', 'par1'], ['pedido', 'ped1']]);
        assert.match(chamadas[0][2], /concilia/i);
        assert.equal(r.boletosAsaasCancelados, 2);
        assert.match(r.message, /2 cobrança\(s\) Asaas cancelada\(s\)/);
        // toda $transaction da rota com timeout/maxWait
        assert.ok(db.opcoesTx.every((o) => o && o.timeout >= 20000 && o.maxWait >= 10000));
    } finally { restaurar(); }
});

test('(b) baixa parcial → NÃO cancela nada no Asaas', async () => {
    const chamadas = [];
    const asaas = {
        cancelarCobrancasDaParcela: async (...a) => { chamadas.push(a); return { canceladas: 1, erros: [] }; },
        cancelarCobrancasDoPedido: async (...a) => { chamadas.push(a); return { canceladas: 1, erros: [] }; }
    };
    const { db, svc, restaurar } = carregar({ parcelas: [{ ...PARCELA, valor: 160 }], asaas });
    try {
        const r = await svc.conciliarUnificado({ lancamentoIds: ['l1'], parcelaReceberIds: ['par1'], metodoPagamento: 'DEPOSITO_BANCARIO', userId: 'u1' });
        assert.equal(db.parcelas[0].status, 'PARCIAL');
        assert.equal(db.lancamentos[0].status, 'CONCILIADO');
        assert.equal(chamadas.length, 0);
        assert.equal(r.boletosAsaasCancelados, 0);
        assert.doesNotMatch(r.message, /Asaas/);
    } finally { restaurar(); }
});

test('(c) Asaas lança erro → conciliação continua OK e devolve sucesso', async () => {
    const asaas = {
        cancelarCobrancasDaParcela: async () => { throw new Error('Asaas fora do ar'); },
        cancelarCobrancasDoPedido: async () => { throw new Error('Asaas fora do ar'); }
    };
    const { db, svc, restaurar } = carregar({ parcelas: [PARCELA], asaas, cobrancas: [{ id: 'cb2', asaasPaymentId: 'pay_qr_entrega', parcelaId: null, pedidoId: 'ped1' }] });
    const errOrig = console.error;
    const logs = [];
    console.error = (...a) => logs.push(a.join(' '));
    try {
        const r = await svc.conciliarUnificado({ lancamentoIds: ['l1'], parcelaReceberIds: ['par1'], metodoPagamento: 'DEPOSITO_BANCARIO', userId: 'u1' });
        assert.match(r.message, /^Conciliado!/);
        assert.equal(r.boletosAsaasCancelados, 0);
        assert.equal(db.lancamentos[0].status, 'CONCILIADO');
        assert.equal(db.parcelas[0].status, 'PAGO');
        assert.ok(logs.some((l) => /Falha ao cancelar cobrança Asaas/.test(l)));
    } finally { console.error = errOrig; restaurar(); }
});

// Asaas falso com estado: cancelar a cobrança da parcela vira CANCELADO local (como o real).
function asaasComEstado(db, { recusar = [] } = {}) {
    const f = { deletes: [], pedidoChamadas: 0 };
    f.cancelarCobrancasDaParcela = async (parcelaId) => {
        let canceladas = 0; const erros = [];
        for (const c of db.cobrancas.filter((x) => x.parcelaId === parcelaId && ['PENDENTE', 'EXPIRADO'].includes(x.status))) {
            f.deletes.push(c.asaasPaymentId);
            if (recusar.includes(c.asaasPaymentId)) { erros.push({ paymentId: c.asaasPaymentId, erro: 'já pago' }); continue; }
            c.status = 'CANCELADO'; canceladas++;
        }
        return { canceladas, erros };
    };
    f.cancelarCobrancasDoPedido = async (pedidoId) => {
        f.pedidoChamadas++;
        let canceladas = 0;
        for (const c of db.cobrancas.filter((x) => x.pedidoId === pedidoId && ['PENDENTE', 'EXPIRADO'].includes(x.status))) {
            f.deletes.push(c.asaasPaymentId); c.status = 'CANCELADO'; canceladas++;
        }
        return { canceladas, erros: [] };
    };
    return f;
}

function carregarComEstado(opts, asaasOpts) {
    const ctx = carregar({ ...opts, asaas: {} });
    const asaas = asaasComEstado(ctx.db, asaasOpts);
    ctx.restaurar();
    const db = ctx.db;
    const restDb = stubModule(DB_MODULE, db.prisma);
    const restAsaas = stubModule(ASAAS_MODULE, asaas);
    limparCacheContendo('conciliacaoBancariaService');
    const svc = require(SERVICE);
    return { db, svc, asaas, restaurar: () => { restDb(); restAsaas(); limparCacheContendo('conciliacaoBancariaService'); } };
}

const COBRANCAS = [
    { id: 'cb1', asaasPaymentId: 'pay_boleto', parcelaId: 'par1', pedidoId: 'ped1' },
    { id: 'cb2', asaasPaymentId: 'pay_qr_entrega', parcelaId: null, pedidoId: 'ped1' }
];

test('(d) sem DELETE repetido: boleto da parcela cancelado 1x; QR de entrega pelo pedido', async () => {
    const { db, svc, asaas, restaurar } = carregarComEstado({ parcelas: [PARCELA], cobrancas: COBRANCAS });
    try {
        const r = await svc.conciliarUnificado({ lancamentoIds: ['l1'], parcelaReceberIds: ['par1'], metodoPagamento: 'DEPOSITO_BANCARIO', userId: 'u1' });
        assert.deepEqual(asaas.deletes, ['pay_boleto', 'pay_qr_entrega']);
        assert.equal(r.boletosAsaasCancelados, 2);
        assert.match(r.message, /2 cobrança\(s\) Asaas cancelada\(s\)/);
        assert.ok(db.cobrancas.every((c) => c.status === 'CANCELADO'));
    } finally { restaurar(); }
});

test('(e) Asaas recusou o boleto na parcela → a varredura do pedido NÃO repete o DELETE', async () => {
    const { svc, asaas, restaurar } = carregarComEstado(
        { parcelas: [PARCELA], cobrancas: [COBRANCAS[0]] }, { recusar: ['pay_boleto'] });
    const errOrig = console.error; console.error = () => {};
    try {
        const r = await svc.conciliarUnificado({ lancamentoIds: ['l1'], parcelaReceberIds: ['par1'], metodoPagamento: 'DEPOSITO_BANCARIO', userId: 'u1' });
        assert.deepEqual(asaas.deletes, ['pay_boleto']); // 1 tentativa só
        assert.equal(asaas.pedidoChamadas, 0);
        assert.match(r.message, /^Conciliado!/);
    } finally { console.error = errOrig; restaurar(); }
});

test('(f) corrigirContaBaixa: Pix informado confirmado depois (quita) → cancela cobrança Asaas', async () => {
    const parcela = { ...PARCELA, valor: 100 };
    const pagamentosIniciais = [{ id: 'pgx', parcelaId: 'par1', valorRecebido: 100, valorDesconto: 0, confirmado: false, estornado: false }];
    const { db, svc, asaas, restaurar } = carregarComEstado({ parcelas: [parcela], cobrancas: COBRANCAS, pagamentosIniciais });
    try {
        const r = await svc.corrigirContaBaixa({ tipo: 'RECEBER', pagamentoId: 'pgx', novaContaId: 'cf1', userId: 'u1' });
        assert.equal(db.pagamentos[0].confirmado, true);
        assert.equal(db.parcelas[0].status, 'PAGO');
        assert.deepEqual(asaas.deletes, ['pay_boleto', 'pay_qr_entrega']);
        assert.equal(r.boletosAsaasCancelados, 2);
        assert.match(r.message, /2 cobrança\(s\) Asaas cancelada\(s\)/);
    } finally { restaurar(); }
});

test('(g) corrigirContaBaixa: confirmação que deixa a parcela PARCIAL → não cancela', async () => {
    const parcela = { ...PARCELA, valor: 160 };
    const pagamentosIniciais = [{ id: 'pgx', parcelaId: 'par1', valorRecebido: 100, valorDesconto: 0, confirmado: false, estornado: false }];
    const { db, svc, asaas, restaurar } = carregarComEstado({ parcelas: [parcela], cobrancas: COBRANCAS, pagamentosIniciais });
    try {
        const r = await svc.corrigirContaBaixa({ tipo: 'RECEBER', pagamentoId: 'pgx', novaContaId: 'cf1', userId: 'u1' });
        assert.equal(db.parcelas[0].status, 'PARCIAL');
        assert.deepEqual(asaas.deletes, []);
        assert.doesNotMatch(r.message, /Asaas/);
    } finally { restaurar(); }
});
