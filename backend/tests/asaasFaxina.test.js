// Faxina automática do Asaas: título quitado no app → cobrança aberta é cancelada sozinha.
// Sem rede e sem banco: Prisma, asaasService e backupService são fakes em memória.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.JWT_SECRET = 'segredo-teste-faxina-0123456789abcdef';

const { stubModule, limparCacheContendo } = require('./helpers/mockPrisma');
const { casa } = require('./helpers/casaWhere');

const DB_MODULE = path.join(__dirname, '../config/database.js');
const ASAAS_MODULE = path.join(__dirname, '../services/asaasService.js');
const BACKUP_MODULE = path.join(__dirname, '../services/backupService.js');
const FAXINA = path.join(__dirname, '../services/asaasFaxinaService.js');

const AGORA = new Date('2026-11-25T15:00:00Z');
const H = (h) => new Date(AGORA.getTime() - h * 3600 * 1000);
const MIN = (m) => new Date(AGORA.getTime() - m * 60000);

let seq = 0;
// Cobrança com o formato que o service espera do Prisma (relações já aninhadas).
function cob({ id = `cb${++seq}`, status = 'PENDENTE', ambiente = 'PRODUCAO', createdAt = H(48),
    parcela = null, pedido = null, parcelaId, pedidoId } = {}) {
    return {
        id, asaasPaymentId: `pay_${id}`, tipo: 'BOLETO', status, ambiente, valor: 100, createdAt,
        parcelaId: parcelaId !== undefined ? parcelaId : (parcela?.id || null),
        pedidoId: pedidoId !== undefined ? pedidoId : (pedido ? pedido.id : null),
        parcela, pedido: pedido ? { numero: 1, contaReceber: pedido.contaReceber } : null
    };
}
const parcelaDe = (id, status, conta, updatedAt = H(2)) => ({ id, status, updatedAt, contaReceber: conta });
const conta = (id, status, updatedAt = H(2), pedidoId = null) => ({ id, status, updatedAt, pedidoId });

function carregar({ cobrancas, asaas = {}, ambienteLocal = false, configurado = true, aoBuscar = null }) {
    const db = { cobrancas, resumo: null, buscas: 0 };
    const parcelas = new Map(), contas = new Map();
    for (const c of cobrancas) {
        if (c.parcela) { parcelas.set(c.parcela.id, c.parcela); if (c.parcela.contaReceber) contas.set(c.parcela.contaReceber.id, c.parcela.contaReceber); }
        if (c.pedido?.contaReceber) contas.set(c.pedido.contaReceber.id, c.pedido.contaReceber);
    }
    db.parcelas = parcelas; db.contas = contas;
    const prisma = {
        cobrancaAsaas: {
            findMany: async ({ where, take }) => {
                db.buscas++;
                // cópias: o que o service leu na busca não muda quando o "mundo" muda depois
                const r = structuredClone(db.cobrancas.filter((c) => casa(c, where)).slice(0, take));
                if (aoBuscar) aoBuscar(db);
                return r;
            }
        },
        parcela: { findUnique: async ({ where }) => parcelas.get(where.id) || null },
        contaReceber: { findUnique: async ({ where }) => contas.get(where.id) || null },
        appConfig: { upsert: async ({ where, create }) => { db.resumo = create.value; return create; } }
    };
    const chamadas = [];
    const fakeAsaas = {
        AMBIENTE: 'PRODUCAO',
        configurado: () => configurado,
        cancelarCobrancasDaParcela: async (id, motivo) => { chamadas.push(['parcela', id, motivo]); return { canceladas: 1, erros: [] }; },
        cancelarCobrancasDoPedido: async (id, motivo) => { chamadas.push(['pedido', id, motivo]); return { canceladas: 1, erros: [] }; },
        ...asaas
    };
    const restDb = stubModule(DB_MODULE, prisma);
    const restAsaas = stubModule(ASAAS_MODULE, fakeAsaas);
    const restBackup = stubModule(BACKUP_MODULE, { ambienteLocal: () => ambienteLocal });
    limparCacheContendo('asaasFaxinaService');
    const svc = require(FAXINA);
    svc._resetarBackoff();
    return { db, svc, chamadas, restaurar: () => { restDb(); restAsaas(); restBackup(); limparCacheContendo('asaasFaxinaService'); delete process.env.ASAAS_FAXINA_DESLIGADA; } };
}

const rodar = (svc, extra = {}) => svc.executar({ agora: AGORA, pausaMs: 0, ...extra });

test('(2-revisor) status da parcela/conta MUDA entre a busca e a classificação → reconsulta e NÃO cancela', async () => {
    // a) parcela PAGO (conta PARCIAL) é estornada logo depois da busca
    const ca = conta('ca', 'PARCIAL');
    const c1 = cob({ parcela: parcelaDe('par1', 'PAGO', ca) });
    // b) PIX de entrega: conta do pedido QUITADO volta a ABERTO logo depois da busca
    const cb = conta('cb', 'QUITADO');
    const c2 = cob({ parcela: null, pedido: { id: 'ped2', contaReceber: cb } });
    const { svc, chamadas, restaurar } = carregar({
        cobrancas: [c1, c2],
        aoBuscar: (db) => { if (db.buscas === 2) { db.parcelas.get('par1').status = 'PENDENTE'; db.contas.get('cb').status = 'ABERTO'; } } // só na busca do ciclo (a 1ª é a conferência do teste)
    });
    try {
        const busca = await svc.buscarElegiveis({ agora: AGORA });
        assert.equal(busca.elegiveis.length, 2, 'a busca ainda via as duas como elegíveis');
        const r = await rodar(svc);
        assert.equal(r.elegiveis, 2);
        assert.equal(chamadas.length, 0, 'a reconsulta tem que impedir o cancelamento');
        assert.equal(r.tentadas, 0);
    } finally { restaurar(); }
});



test('(9) parcela PAGO → cancelarCobrancasDaParcela com o id certo; conta QUITADO sem parcela → cancelarCobrancasDoPedido', async () => {
    const contaAberta = conta('c1', 'PARCIAL');
    const c1 = cob({ parcela: parcelaDe('par1', 'PAGO', contaAberta) });
    const contaQuitada = conta('c2', 'QUITADO');
    const c2 = cob({ parcela: null, pedido: { id: 'ped2', contaReceber: contaQuitada } });
    const { db, svc, chamadas, restaurar } = carregar({ cobrancas: [c1, c2] });
    try {
        const r = await rodar(svc);
        assert.equal(r.ok, true);
        assert.deepEqual(chamadas.map((c) => c.slice(0, 2)), [['parcela', 'par1'], ['pedido', 'ped2']]);
        assert.match(chamadas[0][2], /faxina/i);
        assert.equal(r.canceladas, 2);
        assert.equal(db.resumo.canceladas, 2); // resumo gravado em app_configs
        assert.equal(db.resumo.tentadas, 2);
        assert.ok(db.resumo.em && 'emBackoff' in db.resumo && 'puladas' in db.resumo && 'elegiveis' in db.resumo && 'recusadas' in db.resumo);
    } finally { restaurar(); }
});

test('(10) parcela PAGO em conta PARCIAL → NÃO chama cancelarCobrancasDoPedido (nem cancela o boleto de outra parcela)', async () => {
    const contaParcial = conta('c1', 'PARCIAL');
    // a cobrança TEM pedidoId, mas o pedido não está quitado
    const c1 = cob({ parcela: parcelaDe('par1', 'PAGO', contaParcial), pedidoId: 'ped1' });
    c1.pedido = { numero: 1, contaReceber: contaParcial };
    const { svc, chamadas, restaurar } = carregar({ cobrancas: [c1] });
    try {
        await rodar(svc);
        assert.deepEqual(chamadas.map((c) => c.slice(0, 2)), [['parcela', 'par1']]);
        assert.equal(chamadas.filter((c) => c[0] === 'pedido').length, 0);
    } finally { restaurar(); }
});

test('(11) conta ABERTO/PARCIAL/aguardandoConciliacao e parcela em aberto → nada', async () => {
    const cobs = [
        cob({ parcela: parcelaDe('p1', 'PENDENTE', conta('ca', 'ABERTO')) }),
        cob({ parcela: parcelaDe('p2', 'PARCIAL', conta('cb', 'PARCIAL')) }),
        cob({ parcela: parcelaDe('p3', 'PENDENTE', { ...conta('cc', 'ABERTO'), aguardandoConciliacao: true }) }),
        cob({ parcela: null, pedido: { id: 'ped4', contaReceber: conta('cd', 'CANCELADO') } }) // conta CANCELADO fica de fora
    ];
    const { svc, chamadas, restaurar } = carregar({ cobrancas: cobs });
    try {
        const r = await rodar(svc);
        assert.equal(chamadas.length, 0);
        assert.equal(r.elegiveis, 0);
    } finally { restaurar(); }
});

test('(12) RECEBIDO / CANCELADO / SANDBOX ficam de fora', async () => {
    const q = () => parcelaDe(`p${++seq}`, 'PAGO', conta(`c${seq}`, 'QUITADO'));
    const cobs = [cob({ status: 'RECEBIDO', parcela: q() }), cob({ status: 'CANCELADO', parcela: q() }), cob({ ambiente: 'SANDBOX', parcela: q() }), cob({ status: 'EXPIRADO', parcela: q() })];
    const { svc, chamadas, restaurar } = carregar({ cobrancas: cobs });
    try {
        const r = await rodar(svc);
        assert.equal(r.elegiveis, 1); // só o EXPIRADO (boleto vencido continua pagável)
        assert.equal(chamadas.length, 1);
    } finally { restaurar(); }
});

test('(13) carência de 10 min e cobrança criada DEPOIS da quitação são respeitadas (diag lista as ignoradas)', async () => {
    const recente = cob({ parcela: parcelaDe('pr', 'PAGO', conta('cr', 'QUITADO', MIN(3)), MIN(3)), createdAt: H(48) });
    const posterior = cob({ parcela: parcelaDe('pp', 'PAGO', conta('cp', 'QUITADO', H(5)), H(5)), createdAt: H(1) });
    const madura = cob({ parcela: parcelaDe('pm', 'PAGO', conta('cm', 'QUITADO', MIN(11)), MIN(11)), createdAt: H(48) });
    const { svc, chamadas, restaurar } = carregar({ cobrancas: [recente, posterior, madura] });
    try {
        const busca = await svc.buscarElegiveis({ agora: AGORA });
        assert.deepEqual(busca.elegiveis.map((e) => e.paymentId), [madura.asaasPaymentId]);
        assert.deepEqual(busca.ignoradaPorSerPosterior.map((e) => e.paymentId), [posterior.asaasPaymentId]);
        assert.deepEqual(busca.emCarencia.map((e) => e.paymentId), [recente.asaasPaymentId]);
        await rodar(svc);
        assert.deepEqual(chamadas.map((c) => c[1]), ['pm']);
    } finally { restaurar(); }
});

test('(14) erro → backoff; ciclo dentro do prazo não chama; depois do prazo chama; sucesso limpa', async () => {
    let falhar = true;
    const c1 = cob({ parcela: parcelaDe('par1', 'PAGO', conta('c1', 'QUITADO')) });
    let n = 0;
    const asaas = {
        cancelarCobrancasDaParcela: async () => {
            n++;
            return falhar ? { canceladas: 0, erros: [{ paymentId: c1.asaasPaymentId, erro: 'Asaas recusou' }] } : { canceladas: 1, erros: [] };
        }
    };
    const { svc, restaurar } = carregar({ cobrancas: [c1], asaas });
    const errOrig = console.error; console.error = () => {};
    try {
        const r1 = await svc.executar({ agora: AGORA, pausaMs: 0 });
        assert.equal(n, 1);
        assert.equal(r1.recusadas, 1);
        assert.equal(r1.emBackoff, 1);
        const espera = svc.estadoBackoff();
        assert.equal(espera.length, 1);
        assert.equal(espera[0].falhas, 1);
        assert.equal(espera[0].proxima.getTime(), AGORA.getTime() + 30 * 60000);

        await svc.executar({ agora: new Date(AGORA.getTime() + 20 * 60000), pausaMs: 0 }); // dentro dos 30 min
        assert.equal(n, 1, 'dentro do prazo não chama o Asaas');

        await svc.executar({ agora: new Date(AGORA.getTime() + 31 * 60000), pausaMs: 0 }); // passou o prazo, falha de novo
        assert.equal(n, 2);
        assert.equal(svc.estadoBackoff()[0].falhas, 2);
        assert.equal(svc.estadoBackoff()[0].proxima.getTime(), AGORA.getTime() + 31 * 60000 + 60 * 60000); // 2ª falha = 1h

        falhar = false;
        const r4 = await svc.executar({ agora: new Date(AGORA.getTime() + 31 * 60000 + 61 * 60000), pausaMs: 0 });
        assert.equal(n, 3);
        assert.equal(r4.canceladas, 1);
        assert.equal(svc.estadoBackoff().length, 0, 'sucesso limpa o backoff');
    } finally { console.error = errOrig; restaurar(); }
});

test('(14b) 3ª recusa seguida emite 1 aviso (warn) de "pode estar paga"', async () => {
    const c1 = cob({ parcela: parcelaDe('par1', 'PAGO', conta('c1', 'QUITADO')) });
    const asaas = { cancelarCobrancasDaParcela: async () => ({ canceladas: 0, erros: [{ paymentId: c1.asaasPaymentId, erro: 'x' }] }) };
    const { svc, restaurar } = carregar({ cobrancas: [c1], asaas });
    const eo = console.error, wo = console.warn; const warns = []; const errs = [];
    console.error = (...a) => errs.push(a.join(' ')); console.warn = (...a) => warns.push(a.join(' '));
    try {
        let t = AGORA.getTime();
        for (let i = 0; i < 4; i++) { await svc.executar({ agora: new Date(t), pausaMs: 0 }); t += 25 * 3600 * 1000; }
        assert.equal(warns.length, 1);
        assert.match(warns[0], /3x seguidas/);
        assert.ok(errs.length >= 1 && errs.length <= 2); // 1ª (e 5ª, que não chegou) — nunca 1 por tentativa
    } finally { console.error = eo; console.warn = wo; restaurar(); }
});

test('(15) teto: 50 cobranças elegíveis → só 30 por ciclo', async () => {
    const cobs = Array.from({ length: 50 }, () => cob({ parcela: parcelaDe(`p${++seq}`, 'PAGO', conta(`c${seq}`, 'QUITADO')) }));
    const { svc, chamadas, restaurar } = carregar({ cobrancas: cobs });
    try {
        const r = await rodar(svc);
        assert.equal(chamadas.length, 30);
        assert.equal(r.tentadas, 30);
        assert.equal(r.puladas, 20);
        const r2 = await rodar(svc, { teto: 100 });
        assert.equal(r2.tentadas, 50); // sem backoff, o 2º ciclo repete todos (o fake não muda o status)
    } finally { restaurar(); }
});

test('(16) trava anti-sobreposição: 2º ciclo enquanto o 1º roda não chama o Asaas de novo', async () => {
    let liberar;
    const espera = new Promise((r) => { liberar = r; });
    let n = 0;
    const c1 = cob({ parcela: parcelaDe('par1', 'PAGO', conta('c1', 'QUITADO')) });
    const asaas = { cancelarCobrancasDaParcela: async () => { n++; await espera; return { canceladas: 1, erros: [] }; } };
    const { svc, restaurar } = carregar({ cobrancas: [c1], asaas });
    try {
        const p1 = rodar(svc);
        await new Promise((r) => setImmediate(r));
        const r2 = await rodar(svc);
        assert.equal(r2.pulado, true);
        assert.match(r2.motivo, /andamento/);
        liberar();
        const r1 = await p1;
        assert.equal(r1.canceladas, 1);
        assert.equal(n, 1);
        const r3 = await rodar(svc); // liberou: roda de novo
        assert.equal(r3.ok, true);
    } finally { restaurar(); }
});

test('(17) ambiente local / Asaas não configurado / ASAAS_FAXINA_DESLIGADA=1 → nada (nem consulta o banco)', async () => {
    const mk = () => cob({ parcela: parcelaDe('par1', 'PAGO', conta('c1', 'QUITADO')) });
    let ctx = carregar({ cobrancas: [mk()], ambienteLocal: true });
    try {
        const r = await rodar(ctx.svc);
        assert.equal(r.pulado, true); assert.match(r.motivo, /local/);
        assert.equal(ctx.chamadas.length, 0); assert.equal(ctx.db.buscas, 0); assert.equal(ctx.db.resumo, null);
    } finally { ctx.restaurar(); }
    ctx = carregar({ cobrancas: [mk()], configurado: false });
    try {
        const r = await rodar(ctx.svc);
        assert.equal(r.pulado, true); assert.equal(ctx.chamadas.length, 0); assert.equal(ctx.db.buscas, 0);
    } finally { ctx.restaurar(); }
    ctx = carregar({ cobrancas: [mk()] });
    try {
        process.env.ASAAS_FAXINA_DESLIGADA = '1';
        let r = await rodar(ctx.svc);
        assert.equal(r.pulado, true); assert.match(r.motivo, /ASAAS_FAXINA_DESLIGADA/);
        assert.equal(ctx.chamadas.length, 0); assert.equal(ctx.db.buscas, 0);
        delete process.env.ASAAS_FAXINA_DESLIGADA; // lida a cada ciclo: religa sem reiniciar
        r = await rodar(ctx.svc);
        assert.equal(r.ok, true); assert.equal(ctx.chamadas.length, 1);
    } finally { ctx.restaurar(); }
});

test('dryRun: classifica mas não chama o Asaas nem grava resumo', async () => {
    const c1 = cob({ parcela: parcelaDe('par1', 'PAGO', conta('c1', 'QUITADO')) });
    const { db, svc, chamadas, restaurar } = carregar({ cobrancas: [c1] });
    try {
        const r = await rodar(svc, { dryRun: true });
        assert.equal(r.tentadas, 1);
        assert.equal(chamadas.length, 0);
        assert.equal(db.resumo, null);
    } finally { restaurar(); }
});

// ───────────────────── B2: asaasService real, sem rede ─────────────────────

test('(18) cancelamento usa updateMany guardado: webhook RECEBIDO no meio NÃO vira CANCELADO', async () => {
    const AXIOS = require.resolve('axios');
    const db = { cob: { id: 'cb1', asaasPaymentId: 'pay_1', tipo: 'BOLETO', status: 'PENDENTE', parcelaId: 'par1', pedidoId: 'ped1', ambiente: 'PRODUCAO' }, updateManyWhere: null };
    const http = {
        delete: async () => { db.cob.status = 'RECEBIDO'; return { data: {} }; }, // webhook chegou enquanto falávamos com o Asaas
        get: async () => ({ data: {} }), post: async () => ({ data: {} }), put: async () => ({ data: {} })
    };
    const prisma = {
        cobrancaAsaas: {
            findMany: async ({ where }) => (casa(db.cob, { status: where.status, ambiente: where.ambiente, ...(where.parcelaId ? { parcelaId: where.parcelaId } : { pedidoId: where.pedidoId }) }) ? [{ ...db.cob }] : []),
            updateMany: async ({ where, data }) => {
                db.updateManyWhere = where;
                if (!casa(db.cob, { status: where.status })) return { count: 0 };
                Object.assign(db.cob, data); return { count: 1 };
            },
            update: async () => { throw new Error('update cego proibido: sobrescreveria RECEBIDO'); }
        }
    };
    const antesKey = process.env.ASAAS_API_KEY;
    process.env.ASAAS_API_KEY = 'aact_chave_de_teste';
    const restAxios = stubModule(AXIOS, { create: () => http, ...http });
    const restDb = stubModule(DB_MODULE, prisma);
    limparCacheContendo('asaasService');
    try {
        const svc = require(ASAAS_MODULE);
        const logs = []; const logOrig = console.log; console.log = (...a) => logs.push(a.join(' '));
        const warnOrig = console.warn; console.warn = () => {};
        let r;
        try { r = await svc.cancelarCobrancasDaParcela('par1', 'teste'); } finally { console.log = logOrig; console.warn = warnOrig; }
        assert.equal(db.cob.status, 'RECEBIDO', 'não sobrescreve RECEBIDO');
        assert.equal(r.canceladas, 0, 'count 0 (webhook marcou RECEBIDO) não conta como cancelada');
        assert.ok(!logs.some((l) => /cancelada/.test(l)), 'e não loga "cancelada"');
        assert.deepEqual(db.updateManyWhere.status, { in: ['PENDENTE', 'EXPIRADO'] });
        assert.deepEqual(r.erros, []);
        // e o caminho normal continua cancelando
        db.cob.status = 'PENDENTE';
        http.delete = async () => ({ data: {} });
        const r2 = await svc.cancelarCobrancasDoPedido('ped1', 'teste');
        assert.equal(r2.canceladas, 1);
        assert.equal(db.cob.status, 'CANCELADO');
        assert.equal(db.cob.canceladoMotivo, 'PEDIDO_QUITADO');
    } finally {
        restAxios(); restDb(); limparCacheContendo('asaasService');
        if (antesKey === undefined) delete process.env.ASAAS_API_KEY; else process.env.ASAAS_API_KEY = antesKey;
    }
});
