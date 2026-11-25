// Conciliação bancária: créditos do Asaas que TROCARAM de baixa (caso real 23/10) —
// prevenção (`reservados`), corretor (`trocarVinculosCruzados`) e diagnóstico.
// Sem rede e sem banco: Prisma é um fake em memória (NUNCA toca hardt_local nem produção).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.JWT_SECRET = 'segredo-teste-vinculos-0123456789abcdef';

const { stubModule, limparCacheContendo } = require('./helpers/mockPrisma');
const { casa } = require('./helpers/casaWhere');

const DB_MODULE = path.join(__dirname, '../config/database.js');
const CONVERSAO_MODULE = path.join(__dirname, '../services/pedidoConversaoService.js');
const SERVICE = path.join(__dirname, '../services/conciliacaoBancariaService.js');

const CONTA = 'conta-asaas';
const dt = (s) => new Date(`${s}T12:00:00-03:00`);

function baixa(id, parcelaId, valor, { data = '2026-10-23', numeroPedido, cliente = 'Cliente', pedidoId } = {}) {
    return {
        id, parcelaId, valorRecebido: valor, estornado: false, contaFinanceiraCaId: CONTA,
        dataPagamento: dt(data), formaPagamento: 'PIX',
        parcela: {
            numeroParcela: 1, valor, dataVencimento: dt(data),
            contaReceber: { pedidoId, pedido: { numero: numeroPedido, nfeNumero: null }, cliente: { Nome: cliente, NomeFantasia: null } }
        }
    };
}

function lanc(id, valor, refNum, extra = {}) {
    return {
        id, contaFinanceiraCaId: CONTA, tipo: 'CREDITO', status: 'PENDENTE', valor, data: dt('2026-10-23'),
        refNum, pagamentoParcelaId: null, conciliadoAuto: false, conciliadoEm: null, ...extra
    };
}

function criarBanco({ lancamentos, baixas, cobrancas, contas, grupoItens = [] }) {
    const db = { lancamentos, baixas, cobrancas, contas, grupoItens, audit: [], opcoesTx: [], escritasLancamento: 0 };
    const modelos = {
        extratoLancamento: {
            findMany: async ({ where, take }) => {
                const r = db.lancamentos.filter((l) => casa(l, where));
                return take ? r.slice(0, take) : r;
            },
            updateMany: async ({ where, data }) => {
                const ls = db.lancamentos.filter((l) => casa(l, where));
                ls.forEach((l) => Object.assign(l, data));
                if (ls.length) db.escritasLancamento++;
                return { count: ls.length };
            }
        },
        pagamentoParcela: { findMany: async ({ where }) => db.baixas.filter((b) => casa(b, where)) },
        pagamentoParcelaPagar: { findMany: async () => [] },
        cobrancaAsaas: { findMany: async ({ where }) => db.cobrancas.filter((c) => casa(c, where)) },
        contaReceber: { findMany: async ({ where }) => db.contas.filter((c) => casa(c, where)) },
        conciliacaoGrupoItem: { findMany: async ({ where }) => db.grupoItens.filter((i) => casa(i, where)) },
        conciliacaoGrupo: { findMany: async () => [], create: async () => ({ id: 'g1' }) },
        auditLog: { create: async ({ data }) => { db.audit.push(data); return data; } }
    };
    db.prisma = { ...modelos, $transaction: async (fn, opts) => { db.opcoesTx.push(opts); return fn(modelos); } };
    return db;
}

function carregar(seed) {
    const db = criarBanco(seed);
    const restDb = stubModule(DB_MODULE, db.prisma);
    const restConv = stubModule(CONVERSAO_MODULE, { converterEspeciaisDasBaixas: async () => [] });
    limparCacheContendo('conciliacaoBancariaService');
    const svc = require(SERVICE);
    return { db, svc, restaurar: () => { restDb(); restConv(); limparCacheContendo('conciliacaoBancariaService'); } };
}

const rodar = (svc) => svc.conciliarAutomatico({ contaFinanceiraCaId: CONTA, de: '2026-10-22', ate: '2026-10-24', userId: 'u1' });
const porId = (db, id) => db.lancamentos.find((l) => l.id === id);

// Cobranças do caso real: boleto do Auto Posto (parcela) e PIX de entrega do Jerry (só pedido)
const COB_AUTO_POSTO = { asaasPaymentId: 'pay_bcv591qb3ahkmqey', parcelaId: 'par3641', pedidoId: 'ped3641', pedido: { numero: 3641 }, cliente: { Nome: 'Auto Posto', NomeFantasia: null }, parcela: { contaReceber: { pedidoId: 'ped3641', pedido: { numero: 3641 } } } };
const COB_JERRY = { asaasPaymentId: 'pay_xicrbox0gmlxl244', parcelaId: null, pedidoId: 'ped3818', pedido: { numero: 3818 }, cliente: { Nome: 'Jerry', NomeFantasia: null }, parcela: null };
const CONTAS = [{ pedidoId: 'ped3641', parcelas: [{ id: 'par3641' }] }, { pedidoId: 'ped3818', parcelas: [{ id: 'par3818' }] }];
const BAIXA_AUTO = () => baixa('b-auto', 'par3641', 234.44, { numeroPedido: 3641, pedidoId: 'ped3641', cliente: 'Auto Posto' });
const BAIXA_JERRY = () => baixa('b-jerry', 'par3818', 234.45, { numeroPedido: 3818, pedidoId: 'ped3818', cliente: 'Jerry' });

// ───────────────────────── A: prevenção ─────────────────────────

test('(1) cobrança conhecida sem baixa livre + baixa de OUTRO pedido a 1 centavo → continua PENDENTE', async () => {
    const { db, svc, restaurar } = carregar({
        lancamentos: [lanc('l-jerry', 234.45, COB_JERRY.asaasPaymentId)],
        baixas: [BAIXA_AUTO()], cobrancas: [COB_JERRY], contas: CONTAS
    });
    try {
        const r = await rodar(svc);
        assert.equal(r.conciliados, 0);
        assert.equal(porId(db, 'l-jerry').status, 'PENDENTE');
        assert.equal(porId(db, 'l-jerry').pagamentoParcelaId, null);
    } finally { restaurar(); }
});

test('(2) depois o Caixa cria a baixa do pedido → a próxima rodada fecha na baixa certa (pay_ exato)', async () => {
    const { db, svc, restaurar } = carregar({
        lancamentos: [lanc('l-jerry', 234.45, COB_JERRY.asaasPaymentId)],
        baixas: [BAIXA_AUTO()], cobrancas: [COB_JERRY], contas: CONTAS
    });
    try {
        await rodar(svc);
        assert.equal(porId(db, 'l-jerry').status, 'PENDENTE');
        db.baixas.push(BAIXA_JERRY()); // Caixa registra a baixa do pedido
        const r = await rodar(svc);
        assert.equal(r.conciliados, 1);
        assert.equal(porId(db, 'l-jerry').status, 'CONCILIADO');
        assert.equal(porId(db, 'l-jerry').pagamentoParcelaId, 'b-jerry');
    } finally { restaurar(); }
});

test('(3) reproduz 23/10: 14:48 Jerry, baixa do Jerry só às 18:53, 20:14 Auto Posto → cada crédito na baixa do próprio pedido', async () => {
    // 14:44 baixa do boleto do Auto Posto (ASAAS) já existe, livre
    const { db, svc, restaurar } = carregar({
        lancamentos: [lanc('l-jerry', 234.45, COB_JERRY.asaasPaymentId)],
        baixas: [BAIXA_AUTO()], cobrancas: [COB_AUTO_POSTO, COB_JERRY], contas: CONTAS
    });
    try {
        await rodar(svc); // 14:48 — extrato traz o crédito do Jerry
        assert.equal(porId(db, 'l-jerry').status, 'PENDENTE', 'não pode grudar na baixa do Auto Posto');
        db.baixas.push(BAIXA_JERRY()); // 18:53 Caixa
        db.lancamentos.push(lanc('l-auto', 234.44, COB_AUTO_POSTO.asaasPaymentId)); // 20:14 chega o crédito do boleto
        const r = await rodar(svc);
        assert.equal(r.conciliados, 2);
        assert.equal(porId(db, 'l-jerry').pagamentoParcelaId, 'b-jerry');
        assert.equal(porId(db, 'l-auto').pagamentoParcelaId, 'b-auto');
    } finally { restaurar(); }
});

test('(4) cobrança DESCONHECIDA no app ("Pix recebido" do Asaas) com 1 candidato por valor concilia como hoje', async () => {
    const { db, svc, restaurar } = carregar({
        lancamentos: [lanc('l-x', 234.44, 'pay_desconhecida')],
        baixas: [BAIXA_AUTO()], cobrancas: [], contas: CONTAS
    });
    try {
        const r = await rodar(svc);
        assert.equal(r.conciliados, 1);
        assert.equal(porId(db, 'l-x').pagamentoParcelaId, 'b-auto');
    } finally { restaurar(); }
});

test('(5) cobrança conhecida SEM destino (parcelaId e pedidoId nulos) concilia por valor', async () => {
    const semDestino = { asaasPaymentId: 'pay_orfa', parcelaId: null, pedidoId: null, pedido: null, cliente: null, parcela: null };
    const { db, svc, restaurar } = carregar({
        lancamentos: [lanc('l-x', 234.44, 'pay_orfa')],
        baixas: [BAIXA_AUTO()], cobrancas: [semDestino], contas: CONTAS
    });
    try {
        const r = await rodar(svc);
        assert.equal(r.conciliados, 1);
        assert.equal(porId(db, 'l-x').pagamentoParcelaId, 'b-auto');
    } finally { restaurar(); }
});

test('(6) crédito MENOR que a baixa da própria cobrança → PENDENTE (e não pega outra baixa de mesmo valor)', async () => {
    const baixaPropria = baixa('b-prop', 'par3641', 100, { numeroPedido: 3641, pedidoId: 'ped3641' });
    const baixaOutra = baixa('b-outra', 'par3818', 90, { numeroPedido: 3818, pedidoId: 'ped3818' });
    const { db, svc, restaurar } = carregar({
        lancamentos: [lanc('l-x', 90, COB_AUTO_POSTO.asaasPaymentId)],
        baixas: [baixaPropria, baixaOutra], cobrancas: [COB_AUTO_POSTO], contas: CONTAS
    });
    try {
        const r = await rodar(svc);
        assert.equal(r.conciliados, 0);
        assert.equal(porId(db, 'l-x').status, 'PENDENTE');
    } finally { restaurar(); }
});

test('baixaPertenceACobranca: parcela da cobrança ou parcela da conta do pedido', () => {
    const { svc, restaurar } = carregar({ lancamentos: [], baixas: [], cobrancas: [], contas: [] });
    try {
        const f = svc.baixaPertenceACobranca;
        assert.equal(f('p1', { parcelaId: 'p1' }), true);
        assert.equal(f('p2', { parcelaId: 'p1' }), false);
        assert.equal(f('p2', { parcelaId: null, pedidoId: 'ped' }, ['p2', 'p3']), true);
        assert.equal(f('p9', { parcelaId: null, pedidoId: 'ped' }, ['p2', 'p3']), false);
        assert.equal(f('p9', { parcelaId: null, pedidoId: 'ped' }, 'ped'), true);
        assert.equal(f(null, { parcelaId: 'p1' }), false);
    } finally { restaurar(); }
});

// ───────────────────────── A3: corretor ─────────────────────────

// Estado quebrado de 23/10: A (234,45 = PIX Jerry) na baixa do Auto Posto; B (234,44 = boleto) na baixa do Jerry
function cenarioCruzado(extra = {}) {
    return {
        lancamentos: [
            lanc('3910d64d', 234.45, COB_JERRY.asaasPaymentId, { status: 'CONCILIADO', pagamentoParcelaId: 'b-auto', conciliadoAuto: true, conciliadoEm: dt('2026-10-23') }),
            lanc('fed7920b', 234.44, COB_AUTO_POSTO.asaasPaymentId, { status: 'CONCILIADO', pagamentoParcelaId: 'b-jerry', conciliadoAuto: true, conciliadoEm: dt('2026-10-23') })
        ],
        baixas: [BAIXA_AUTO(), BAIXA_JERRY()],
        cobrancas: [COB_AUTO_POSTO, COB_JERRY], contas: CONTAS, ...extra
    };
}
const TROCA = { trocas: [{ lancamentoA: '3910d64d', lancamentoB: 'fed7920b' }] };

test('(7a) trocarVinculosCruzados: dryRun (padrão) NÃO grava e mostra antes/depois', async () => {
    const { db, svc, restaurar } = carregar(cenarioCruzado());
    try {
        const r = await svc.trocarVinculosCruzados({ ...TROCA }); // dryRun padrão
        assert.equal(r.ok, true);
        assert.equal(r.dryRun, true);
        assert.equal(r.gravadas, 0);
        assert.equal(db.escritasLancamento, 0);
        assert.equal(porId(db, '3910d64d').pagamentoParcelaId, 'b-auto');
        const p = r.resultados[0];
        assert.equal(p.antes[0].pedido, 3641);
        assert.equal(p.depois[0].baixa, 'b-jerry');
        assert.equal(p.depois[0].pedido, 3818);
        assert.equal(p.depois[1].baixa, 'b-auto');
        const r2 = await svc.trocarVinculosCruzados({ ...TROCA, dryRun: undefined });
        assert.equal(r2.dryRun, true); // só grava com false explícito
    } finally { restaurar(); }
});

test('(7b) aplicar grava os 2 vínculos, só pagamentoParcelaId; 2ª chamada é jaCorrigido; auditoria fora da transação', async () => {
    const { db, svc, restaurar } = carregar(cenarioCruzado());
    try {
        const antesTudo = JSON.stringify({ baixas: db.baixas, contas: db.contas, cobrancas: db.cobrancas });
        const A0 = { ...porId(db, '3910d64d') };
        const r = await svc.trocarVinculosCruzados({ ...TROCA, dryRun: false });
        assert.equal(r.ok, true);
        assert.equal(r.gravadas, 1);
        assert.equal(porId(db, '3910d64d').pagamentoParcelaId, 'b-jerry');
        assert.equal(porId(db, 'fed7920b').pagamentoParcelaId, 'b-auto');
        // não toca conciliadoAuto/conciliadoEm/status
        assert.equal(porId(db, '3910d64d').conciliadoAuto, A0.conciliadoAuto);
        assert.equal(porId(db, '3910d64d').conciliadoEm, A0.conciliadoEm);
        assert.equal(porId(db, '3910d64d').status, 'CONCILIADO');
        // baixas/contas/cobranças idênticas
        assert.equal(JSON.stringify({ baixas: db.baixas, contas: db.contas, cobrancas: db.cobrancas }), antesTudo);
        // transação com timeout/maxWait
        assert.ok(db.opcoesTx.length === 1 && db.opcoesTx[0].timeout >= 20000 && db.opcoesTx[0].maxWait >= 10000);
        // auditoria
        assert.equal(db.audit.length, 1);
        assert.equal(db.audit[0].acao, 'TROCAR_VINCULOS_EXTRATO');
        assert.equal(db.audit[0].entidade, 'ExtratoLancamento');
        assert.equal(db.audit[0].usuarioId, 'admin-exec');

        const escritas = db.escritasLancamento;
        const r2 = await svc.trocarVinculosCruzados({ ...TROCA, dryRun: false });
        assert.equal(r2.ok, true);
        assert.equal(r2.resultados[0].jaCorrigido, true);
        assert.equal(r2.gravadas, 0);
        assert.equal(db.escritasLancamento, escritas, '2ª chamada não grava');
        assert.equal(db.audit.length, 1);
    } finally { restaurar(); }
});

test('(7c) estado divergente → 409 sem gravar; grupo → recusa; validações básicas', async () => {
    // divergente: a baixa de A é de um 3º pedido
    const terceira = baixa('b-3', 'par9', 234.44, { numeroPedido: 9, pedidoId: 'ped9' });
    let ctx = carregar({ ...cenarioCruzado(), baixas: [terceira, BAIXA_JERRY(), BAIXA_AUTO()] });
    try {
        ctx.db.lancamentos[0].pagamentoParcelaId = 'b-3';
        const r = await ctx.svc.trocarVinculosCruzados({ ...TROCA, dryRun: false });
        assert.equal(r.ok, false);
        assert.equal(r.resultados[0].status, 409);
        assert.equal(ctx.db.escritasLancamento, 0);
        assert.equal(ctx.db.audit.length, 0);
    } finally { ctx.restaurar(); }

    // grupo: lançamento B em um grupo → recusa
    ctx = carregar(cenarioCruzado({ grupoItens: [{ id: 'gi1', grupoId: 'g1', extratoLancamentoId: 'fed7920b', pagamentoParcelaId: null }] }));
    try {
        const r = await ctx.svc.trocarVinculosCruzados({ ...TROCA, dryRun: false });
        assert.equal(r.ok, false);
        assert.match(r.resultados[0].erro, /grupo/i);
        assert.equal(ctx.db.escritasLancamento, 0);
    } finally { ctx.restaurar(); }

    // baixa em grupo → recusa
    ctx = carregar(cenarioCruzado({ grupoItens: [{ id: 'gi2', grupoId: 'g1', extratoLancamentoId: null, pagamentoParcelaId: 'b-auto' }] }));
    try {
        const r = await ctx.svc.trocarVinculosCruzados({ ...TROCA, dryRun: false });
        assert.equal(r.ok, false);
        assert.equal(ctx.db.escritasLancamento, 0);
    } finally { ctx.restaurar(); }

    // lançamento inexistente, não-conciliado, valores que não fecham, baixa estornada
    ctx = carregar(cenarioCruzado());
    try {
        let r = await ctx.svc.trocarVinculosCruzados({ trocas: [{ lancamentoA: '3910d64d', lancamentoB: 'nao-existe' }], dryRun: false });
        assert.equal(r.resultados[0].status, 404);
        ctx.db.lancamentos[1].status = 'PENDENTE';
        r = await ctx.svc.trocarVinculosCruzados({ ...TROCA, dryRun: false });
        assert.equal(r.resultados[0].status, 422);
        ctx.db.lancamentos[1].status = 'CONCILIADO';
        ctx.db.baixas[1].valorRecebido = 300;
        r = await ctx.svc.trocarVinculosCruzados({ ...TROCA, dryRun: false });
        assert.equal(r.resultados[0].status, 422);
        assert.match(r.resultados[0].erro, /valores/i);
        ctx.db.baixas[1].valorRecebido = 234.45;
        ctx.db.baixas[0].estornado = true;
        r = await ctx.svc.trocarVinculosCruzados({ ...TROCA, dryRun: false });
        assert.equal(r.resultados[0].status, 422);
        assert.equal(ctx.db.escritasLancamento, 0);
        await assert.rejects(() => ctx.svc.trocarVinculosCruzados({ trocas: [] }), /trocas/);
    } finally { ctx.restaurar(); }
});

// ───────────────────────── A4: diagnóstico ─────────────────────────

test('(8) diag acusa o par cruzado com trocaSugerida, ignora sem cobrança local e não acusa baixa em outra parcela do mesmo pedido', async () => {
    const cen = cenarioCruzado();
    // 3º crédito: cobrança do pedido 5000 (2 parcelas), baixa na parcela 2 (outra do MESMO pedido) → ok
    cen.contas = [...CONTAS, { pedidoId: 'ped5000', parcelas: [{ id: 'par5000a' }, { id: 'par5000b' }] }];
    cen.cobrancas = [...cen.cobrancas, { asaasPaymentId: 'pay_5000', parcelaId: 'par5000a', pedidoId: 'ped5000', pedido: { numero: 5000 }, cliente: { Nome: 'Padaria', NomeFantasia: null }, parcela: { contaReceber: { pedidoId: 'ped5000', pedido: { numero: 5000 } } } }];
    cen.baixas = [...cen.baixas, baixa('b-5000b', 'par5000b', 80, { numeroPedido: 5000, pedidoId: 'ped5000' })];
    cen.lancamentos = [...cen.lancamentos,
        lanc('l-5000', 80, 'pay_5000', { status: 'CONCILIADO', pagamentoParcelaId: 'b-5000b' }),
        // 4º: sem cobrança local (pay_ de outro sistema)
        lanc('l-sem', 50, 'pay_sem_cobranca', { status: 'CONCILIADO', pagamentoParcelaId: 'b-5000b' })
    ];
    const { svc, restaurar } = carregar(cen);
    try {
        const r = await svc.diagnosticarVinculosCruzados({ contaFinanceiraCaId: CONTA, de: '2026-10-01', ate: '2026-10-31' });
        assert.equal(r.contadores.cruzados, 2);
        assert.equal(r.contadores.ok, 1);
        assert.equal(r.contadores.semCobrancaLocal, 1);
        assert.equal(r.paresSugeridos, 1);
        const jerry = r.cruzados.find((c) => c.lancamentoId === '3910d64d');
        assert.equal(jerry.esperado.pedido, 3818);
        assert.equal(jerry.ligado[0].pedido, 3641);
        assert.deepEqual(jerry.trocaSugerida, { lancamentoA: '3910d64d', lancamentoB: 'fed7920b' });
        assert.ok(!r.cruzados.some((c) => c.lancamentoId === 'l-5000'));
        assert.ok(!('_esperadas' in jerry));
    } finally { restaurar(); }
});

// ───────────────────────── A2b: sugestões da tela ─────────────────────────

test('(2b) listar: crédito de cobrança conhecida NÃO sugere a baixa de outro pedido; cobrança desconhecida sugere por valor', async () => {
    const { db, svc, restaurar } = carregar({
        lancamentos: [lanc('l-jerry', 234.45, COB_JERRY.asaasPaymentId), lanc('l-x', 234.44, 'pay_desconhecida', { fitId: 'f2' })],
        baixas: [BAIXA_AUTO()], cobrancas: [COB_JERRY], contas: CONTAS
    });
    // modelos extras que a listagem consulta
    for (const m of ['transferenciaConta', 'contaFinanceira']) db.prisma[m] = db.prisma[m] || { findMany: async () => [] };
    try {
        const r = await svc.listar({ contaFinanceiraCaId: CONTA, de: '2026-10-22', ate: '2026-10-24', status: 'todos' });
        const linhas = r.linhas || r.lancamentos || r;
        const jerry = linhas.find((l) => l.id === 'l-jerry');
        const x = linhas.find((l) => l.id === 'l-x');
        assert.deepEqual(jerry.sugestoes.map((s) => s.id), []);
        assert.deepEqual(x.sugestoes.map((s) => s.id), ['b-auto']);
    } finally { restaurar(); }
});

test('(8b) diag: cobrança conhecida SEM destino (sem pedido/parcela) NÃO é "cruzado" — conta em semDestino', async () => {
    const semDestino = { asaasPaymentId: 'pay_orfa', parcelaId: null, pedidoId: null, pedido: null, cliente: null, parcela: null };
    const { svc, restaurar } = carregar({
        lancamentos: [lanc('l-orfa', 234.44, 'pay_orfa', { status: 'CONCILIADO', pagamentoParcelaId: 'b-auto' })],
        baixas: [BAIXA_AUTO()], cobrancas: [semDestino], contas: CONTAS
    });
    try {
        const r = await svc.diagnosticarVinculosCruzados({ contaFinanceiraCaId: CONTA, de: '2026-10-01', ate: '2026-10-31' });
        assert.equal(r.contadores.cruzados, 0);
        assert.equal(r.contadores.semDestino, 1);
        assert.equal(r.contadores.ok, 0);
        assert.deepEqual(r.cruzados, []);
    } finally { restaurar(); }
});
