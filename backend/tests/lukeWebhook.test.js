// Testes da Fatia A — Webhook de saída para o Luke (lukeWebhookService + lukeWebhookAdminRoutes).
// Prisma mockado em memória e global.fetch interceptado localmente (nunca sai para a rede).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-teste-jwt-0123456789abcdef';

const { makeMockPrisma, stubModule, limparCacheContendo } = require('./helpers/mockPrisma');
const { startTestServer } = require('./helpers/httpServer');

const RAIZ = path.join(__dirname, '..');
const DATABASE_MODULE = path.join(RAIZ, 'config/database.js');
const CACHE = [
    'services/lukeWebhookService.js',
    'routes/lukeWebhookAdminRoutes.js',
    'middlewares/authMiddleware.js',
    'services/agentePoliticaService.js',
    'services/agenteTokenService.js',
];

function criarMemoria() {
    const configs = new Map();
    const eventos = [];
    const solicitacoes = [];
    const vinculos = [];
    const mensagens = [];
    const audits = [];
    const vendedores = new Map([
        ['adm', { id: 'adm', nome: 'Admin', ativo: true, agente: false, permissoes: { admin: true } }],
        ['comum', { id: 'comum', nome: 'Comum', ativo: true, agente: false, permissoes: {} }],
        ['luke', { id: 'luke', nome: 'Luke', ativo: true, agente: true, acessoExterno: true, permissoes: {} }],
    ]);
    const tokens = new Map();

    const prisma = makeMockPrisma({
        vendedor: {
            findUnique: async ({ where }) => vendedores.get(where.id) || null,
        },
        agenteToken: {
            findUnique: async ({ where }) => {
                const t = where.hash ? [...tokens.values()].find((x) => x.hash === where.hash) : tokens.get(where.id);
                return t ? { ...t, vendedor: vendedores.get(t.vendedorId) } : null;
            },
            update: async ({ where, data }) => Object.assign(tokens.get(where.id), data),
        },
        agentePolitica: { findMany: async () => [] },
        appConfig: {
            findUnique: async ({ where }) => (configs.has(where.key) ? { key: where.key, value: configs.get(where.key) } : null),
            upsert: async ({ where, create, update }) => {
                if (!configs.has(where.key)) configs.set(where.key, create.value);
                else if (update && update.value !== undefined) configs.set(where.key, update.value);
                return { key: where.key, value: configs.get(where.key) };
            },
        },
        agenteSolicitacao: {
            findMany: async ({ where }) => solicitacoes
                .filter((s) => (!where.status?.in || where.status.in.includes(s.status))
                    && (!where.updatedAt?.gt || new Date(s.updatedAt) > new Date(where.updatedAt.gt)))
                .sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt)),
        },
        chatLukeMensagemSolicitacao: {
            findMany: async ({ where }) => vinculos.filter((v) => !where.solicitacaoId?.in || where.solicitacaoId.in.includes(v.solicitacaoId)),
        },
        chatLukeMensagem: {
            updateMany: async ({ where, data }) => {
                let count = 0;
                for (const m of mensagens) {
                    const matchId = where.id?.in ? where.id.in.includes(m.id) : (where.id ? m.id === where.id : true);
                    const matchSt = where.status?.in ? where.status.in.includes(m.status) : (where.status ? m.status === where.status : true);
                    if (matchId && matchSt) { Object.assign(m, data); count += 1; }
                }
                return { count };
            },
        },
        lukeWebhookEvento: {
            createMany: async ({ data, skipDuplicates }) => {
                let count = 0;
                for (const item of data) {
                    if (skipDuplicates && eventos.some((e) => e.chaveDedupe === item.chaveDedupe)) continue;
                    eventos.push({
                        tentativas: 0, httpStatus: null, ultimoErro: null, enviadoEm: null, criadoEm: new Date(),
                        ...item,
                    });
                    count += 1;
                }
                return { count };
            },
            findMany: async ({ where, take } = {}) => {
                let res = eventos.filter((e) => {
                    if (where?.chaveDedupe?.in && !where.chaveDedupe.in.includes(e.chaveDedupe)) return false;
                    if (where?.status && e.status !== where.status) return false;
                    if (where?.tipo && e.tipo !== where.tipo) return false;
                    if (where?.proximaEm?.lte && (!e.proximaEm || new Date(e.proximaEm) > new Date(where.proximaEm.lte))) return false;
                    return true;
                });
                if (take) res = res.slice(0, take);
                return res.map((e) => ({ ...e }));
            },
            findUnique: async ({ where }) => {
                const e = eventos.find((x) => x.id === where.id);
                return e ? { ...e } : null;
            },
            count: async ({ where } = {}) => eventos.filter((e) => (!where?.status || e.status === where.status)).length,
            groupBy: async () => {
                const m = new Map();
                for (const e of eventos) m.set(e.status, (m.get(e.status) || 0) + 1);
                return [...m.entries()].map(([status, c]) => ({ status, _count: { _all: c } }));
            },
            update: async ({ where, data }) => {
                const e = eventos.find((x) => x.id === where.id);
                Object.assign(e, data);
                return { ...e };
            },
            updateMany: async ({ where, data }) => {
                let count = 0;
                for (const e of eventos) {
                    if (where.id && e.id !== where.id) continue;
                    if (where.status?.in && !where.status.in.includes(e.status)) continue;
                    if (typeof where.status === 'string' && e.status !== where.status) continue;
                    if (where.proximaEm?.lte && (!e.proximaEm || new Date(e.proximaEm) > new Date(where.proximaEm.lte))) continue;
                    if (data.tentativas?.increment) {
                        e.tentativas += data.tentativas.increment;
                        const { tentativas: _t, ...resto } = data;
                        Object.assign(e, resto);
                    } else {
                        Object.assign(e, data);
                    }
                    count += 1;
                }
                return { count };
            },
        },
        auditLog: {
            create: async ({ data }) => { audits.push(data); return data; },
        },
    });

    return { configs, eventos, solicitacoes, vinculos, mensagens, audits, tokens, prisma };
}

test('LukeWebhook: marco inicial ignora histórico antigo; estados finais geram evento magro assinado; 500 reagenda, 400 falha e reenviar mantém eventoId; segredo nunca vaza', async () => {
    const mem = criarMemoria();
    const SEGREDO = 'segredo-super-confidencial-luke-998877';
    const fetchOriginal = global.fetch;
    const entregas = [];
    let proximoStatus = 200;

    // 1) Solicitação antiga ANTES do 1º deploy: não pode disparar evento!
    mem.solicitacoes.push({
        id: 'sol-antiga',
        status: 'AUTORIZADA',
        execComecouEm: new Date(Date.now() - 60000),
        updatedAt: new Date(Date.now() - 30000),
    });

    const restaurar = stubModule(DATABASE_MODULE, mem.prisma);
    limparCacheContendo(...CACHE);
    const svc = require('../services/lukeWebhookService');
    const authMiddleware = require('../middlewares/authMiddleware');
    const adminRoutes = require('../routes/lukeWebhookAdminRoutes');
    restaurar();

    const app = express();
    app.use(express.json());
    app.use('/api/agentes-webhook', adminRoutes);
    const srv = await startTestServer(app);

    try {
        // Sem env configurada -> desligado, e 1ª varredura grava marco sem puxar sol-antiga
        delete process.env.LUKE_WEBHOOK_URL;
        delete process.env.LUKE_WEBHOOK_SECRET;
        svc._resetarParaTeste();

        let r = await svc.processarFila();
        assert.equal(r.novos, 0);
        assert.equal(mem.eventos.length, 0);
        assert.ok(mem.configs.has('luke_webhook_inicio'));

        // Com env desligada, enfileirarChat nasce DESLIGADO
        await svc.enfileirarChat({ conversaId: 'conv-1', mensagemId: 'msg-desl', assunto: 'NOTA', qtdAnexos: 1 });
        assert.equal(mem.eventos[0].status, 'DESLIGADO');

        // Agora liga o webhook em HTTPS com HMAC
        process.env.LUKE_WEBHOOK_URL = 'https://webhook.luke.interno/eventos';
        process.env.LUKE_WEBHOOK_SECRET = SEGREDO;
        process.env.LUKE_WEBHOOK_AUTH = 'hmac';

        global.fetch = async (url, opts) => {
            if (!String(url).startsWith('https://webhook.luke.interno')) {
                return fetchOriginal(url, opts);
            }
            entregas.push({ url, headers: opts.headers, body: opts.body });
            if (proximoStatus === 'ERRO_COM_SEGREDO') {
                const e = new Error(`falhou com ${SEGREDO}`);
                throw e;
            }
            return { status: proximoStatus, headers: { get: () => null }, body: { cancel: async () => {} } };
        };

        // 2) Quatro solicitações novas em estados finais + 1 ERRO_INDETERMINADO que depois é repetido e autorizado
        const tAgora = new Date(Date.now() + 2000);
        for (const [id, st] of [['s-aut', 'AUTORIZADA'], ['s-rec', 'RECUSADA'], ['s-err', 'ERRO'], ['s-exp', 'EXPIRADA'], ['s-ind', 'ERRO_INDETERMINADO']]) {
            mem.solicitacoes.push({ id, status: st, execComecouEm: tAgora, updatedAt: tAgora });
        }
        r = await svc.processarFila();
        assert.equal(r.novos, 5);
        assert.equal(r.enviados, 5);
        assert.equal(entregas.length, 5);

        // Assinatura HMAC confere sobre o corpo cru e evento é magro
        const primeira = entregas[0];
        const esperadoHmac = 'sha256=' + crypto.createHmac('sha256', SEGREDO).update(primeira.body, 'utf8').digest('hex');
        assert.equal(primeira.headers['X-Hub-Signature-256'], esperadoHmac);
        const parsed = JSON.parse(primeira.body);
        assert.equal(parsed.tipo, 'solicitacao.atualizada');
        assert.equal(parsed.eventoId, primeira.headers['X-Luke-Delivery']);
        assert.ok(parsed.solicitacao.consultaUrl.startsWith('/api/agente/v1/solicitacoes/'));

        // Repetir s-ind (novo execComecouEm + novo status AUTORIZADA) gera evento novo
        const sInd = mem.solicitacoes.find((x) => x.id === 's-ind');
        sInd.status = 'AUTORIZADA';
        sInd.execComecouEm = new Date(Date.now() + 5000);
        sInd.updatedAt = new Date(Date.now() + 5000);
        r = await svc.processarFila();
        assert.equal(r.novos, 1);
        assert.equal(r.enviados, 1);

        // 3) 500 reagenda (fica PENDENTE); 400 vira FALHA direto sem laço
        proximoStatus = 500;
        const e500 = await svc.enfileirarChat({ conversaId: 'c1', mensagemId: 'm-500', assunto: 'DUVIDA', qtdAnexos: 0 });
        await svc.processarFila({ varrer: false });
        const row500 = mem.eventos.find((x) => x.id === e500.id);
        assert.equal(row500.status, 'PENDENTE');
        assert.equal(row500.tentativas, 1);

        proximoStatus = 400;
        const e400 = await svc.enfileirarChat({ conversaId: 'c1', mensagemId: 'm-400', assunto: 'LANCAMENTO', qtdAnexos: 2 });
        await svc.processarFila({ varrer: false });
        const row400 = mem.eventos.find((x) => x.id === e400.id);
        assert.equal(row400.status, 'FALHA');

        // 4) Erro contendo o segredo nunca grava o segredo em claro
        proximoStatus = 'ERRO_COM_SEGREDO';
        const eSec = await svc.enfileirarChat({ conversaId: 'c1', mensagemId: 'm-sec', assunto: null, qtdAnexos: 0 });
        await svc.processarFila({ varrer: false });
        assert.equal(JSON.stringify(mem.eventos).includes(SEGREDO), false);

        // 5) Rotas admin: usuário comum -> 403; admin -> lista (sem segredo) e reenvia mantendo o MESMO eventoId!
        const H_COMUM = { authorization: `Bearer ${jwt.sign({ id: 'comum' }, process.env.JWT_SECRET)}` };
        const H_ADM = { authorization: `Bearer ${jwt.sign({ id: 'adm' }, process.env.JWT_SECRET)}` };
        assert.equal((await srv.request('GET', '/api/agentes-webhook/eventos', { headers: H_COMUM })).status, 403);

        const lista = await srv.request('GET', '/api/agentes-webhook/eventos', { headers: H_ADM });
        assert.equal(lista.status, 200);
        assert.equal(JSON.stringify(lista.body).includes(SEGREDO), false);
        assert.equal(JSON.stringify(lista.body).includes('webhook.luke.interno'), false);

        proximoStatus = 200;
        const reenv = await srv.request('POST', `/api/agentes-webhook/eventos/${e400.id}/reenviar`, { headers: H_ADM });
        assert.equal(reenv.status, 200);
        assert.equal(reenv.body.evento.eventoId, e400.id);
        await new Promise((res) => setTimeout(res, 30));
        assert.equal(mem.eventos.find((x) => x.id === e400.id).status, 'ENVIADO');
        assert.equal(entregas.at(-1).headers['X-Luke-Delivery'], e400.id);
        assert.ok(mem.audits.some((a) => a.acao === 'LUKE_WEBHOOK_REENVIADO'));
    } finally {
        global.fetch = fetchOriginal;
        delete process.env.LUKE_WEBHOOK_URL;
        delete process.env.LUKE_WEBHOOK_SECRET;
        delete process.env.LUKE_WEBHOOK_AUTH;
        await srv.close();
    }
});
