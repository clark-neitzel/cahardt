// Testes da Fatia B1 + Adendo — Backend do Chat do Luke (chatLukeService, chatLukeRoutes, agenteChatV1Routes, anexos).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
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
    'services/chatLukeService.js',
    'services/lukeWebhookService.js',
    'services/anexoService.js',
    'routes/chatLukeRoutes.js',
    'routes/agenteChatV1Routes.js',
    'routes/agenteApiV1Routes.js',
    'routes/anexos.js',
    'middlewares/authMiddleware.js',
    'services/agentePoliticaService.js',
    'config/agentePoliticaPadrao.js',
    'services/agenteTokenService.js',
];

const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');

function criarBancoChat() {
    const vendedores = new Map();
    const tokens = new Map();
    const configs = new Map();
    const conversas = [];
    const mensagens = [];
    const vinculos = [];
    const anexos = [];
    const eventos = [];
    const solicitacoes = [];
    const limites = new Map();
    const audits = [];
    const iaLogs = [];

    const addVendedor = (v) => vendedores.set(v.id, { ativo: true, agente: false, acessoExterno: false, permissoes: {}, ...v });
    const addToken = (t) => { const r = { id: `tk-${tokens.size + 1}`, revogadoEm: null, expiraEm: null, limitePorMinuto: 500, totalUsos: 0, ...t }; tokens.set(r.id, r); return r; };

    const chatLukeMensagemModel = {
        create: async ({ data }) => {
            if (data.chaveIdempotencia && mensagens.some((m) => m.conversaId === data.conversaId && m.chaveIdempotencia === data.chaveIdempotencia)) {
                const e = new Error('Unique'); e.code = 'P2002'; throw e;
            }
            const now = new Date();
            const row = { id: data.id || crypto.randomUUID(), tipo: 'TEXTO', status: 'ENVIADO', qtdAnexos: 0, criadoEm: now, atualizadoEm: now, ...data };
            mensagens.push(row);
            return { ...row };
        },
        findUnique: async ({ where, select }) => {
            let m = null;
            if (where.id) m = mensagens.find((x) => x.id === where.id);
            else if (where.conversaId_chaveIdempotencia) {
                const w = where.conversaId_chaveIdempotencia;
                m = mensagens.find((x) => x.conversaId === w.conversaId && x.chaveIdempotencia === w.chaveIdempotencia);
            }
            if (!m) return null;
            if (select?.conversa) {
                const c = conversas.find((x) => x.id === m.conversaId);
                return { id: m.id, conversa: c ? { usuarioId: c.usuarioId } : null };
            }
            return { ...m };
        },
        findFirst: async ({ where, orderBy }) => {
            let l = mensagens.filter((m) => {
                if (where.id && m.id !== where.id) return false;
                if (where.conversaId && m.conversaId !== where.conversaId) return false;
                if (where.autor && m.autor !== where.autor) return false;
                return true;
            });
            if (orderBy?.criadoEm === 'desc') l.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
            return l[0] ? { ...l[0] } : null;
        },
        findMany: async ({ where, orderBy, take }) => {
            let l = mensagens.filter((m) => {
                if (where?.conversaId && m.conversaId !== where.conversaId) return false;
                if (where?.criadoEm?.lt && !(new Date(m.criadoEm) < new Date(where.criadoEm.lt))) return false;
                if (where?.criadoEm?.gt && !(new Date(m.criadoEm) > new Date(where.criadoEm.gt))) return false;
                if (where?.atualizadoEm?.gt && !(new Date(m.atualizadoEm) > new Date(where.atualizadoEm.gt))) return false;
                return true;
            });
            if (orderBy?.criadoEm === 'desc') l.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
            else if (orderBy?.criadoEm === 'asc') l.sort((a, b) => new Date(a.criadoEm) - new Date(b.criadoEm));
            else if (orderBy?.atualizadoEm === 'asc') l.sort((a, b) => new Date(a.atualizadoEm) - new Date(b.atualizadoEm));
            if (take) l = l.slice(0, take);
            return l.map((x) => ({ ...x }));
        },
        count: async ({ where }) => mensagens.filter((m) => {
            if (where?.conversaId && m.conversaId !== where.conversaId) return false;
            if (where?.autor && typeof where.autor === 'string' && m.autor !== where.autor) return false;
            if (where?.autor?.in && !where.autor.in.includes(m.autor)) return false;
            if (where?.usuarioId && m.usuarioId !== where.usuarioId) return false;
            if (where?.criadoEm?.gte && !(new Date(m.criadoEm) >= new Date(where.criadoEm.gte))) return false;
            if (where?.criadoEm?.gt && !(new Date(m.criadoEm) > new Date(where.criadoEm.gt))) return false;
            return true;
        }).length,
        aggregate: async ({ where }) => {
            const sum = mensagens
                .filter((m) => m.autor === where.autor && m.usuarioId === where.usuarioId && new Date(m.criadoEm) >= new Date(where.criadoEm.gte))
                .reduce((acc, m) => acc + (m.qtdAnexos || 0), 0);
            return { _sum: { qtdAnexos: sum } };
        },
        updateMany: async ({ where, data }) => {
            let count = 0;
            for (const m of mensagens) {
                if (where.id && typeof where.id === 'string' && m.id !== where.id) continue;
                if (where.id?.in && !where.id.in.includes(m.id)) continue;
                if (where.conversaId && m.conversaId !== where.conversaId) continue;
                if (where.autor && m.autor !== where.autor) continue;
                if (where.status?.in && !where.status.in.includes(m.status)) continue;
                if (typeof where.status === 'string' && m.status !== where.status) continue;
                Object.assign(m, data, { atualizadoEm: data.atualizadoEm || new Date() });
                count += 1;
            }
            return { count };
        },
    };

    const chatLukeConversaModel = {
        findUnique: async ({ where }) => {
            const c = where.id ? conversas.find((x) => x.id === where.id) : conversas.find((x) => x.usuarioId === where.usuarioId);
            return c ? { ...c } : null;
        },
        upsert: async ({ where, create }) => {
            let c = conversas.find((x) => x.usuarioId === where.usuarioId);
            if (!c) {
                c = { id: crypto.randomUUID(), ultimaMensagemEm: null, lidaUsuarioEm: null, criadoEm: new Date(), atualizadoEm: new Date(), ...create };
                conversas.push(c);
            }
            return { ...c };
        },
        update: async ({ where, data }) => {
            const c = conversas.find((x) => x.id === where.id);
            Object.assign(c, data, { atualizadoEm: new Date() });
            return { ...c };
        },
        updateMany: async ({ where, data }) => {
            const c = conversas.find((x) => x.id === where.id);
            if (!c) return { count: 0 };
            Object.assign(c, data);
            return { count: 1 };
        },
        findMany: async ({ where, take }) => {
            let l = conversas.filter((c) => {
                if (where?.ultimaMensagemEm?.not === null && c.ultimaMensagemEm == null) return false;
                if (where?.ultimaMensagemEm?.gt && (!c.ultimaMensagemEm || !(new Date(c.ultimaMensagemEm) > new Date(where.ultimaMensagemEm.gt)))) return false;
                return true;
            }).sort((a, b) => new Date(b.ultimaMensagemEm) - new Date(a.ultimaMensagemEm));
            if (take) l = l.slice(0, take);
            return l.map((x) => ({ ...x }));
        },
    };

    const vinculoModel = {
        createMany: async ({ data, skipDuplicates }) => {
            let count = 0;
            for (const d of data) {
                if (skipDuplicates && vinculos.some((v) => v.mensagemId === d.mensagemId && v.solicitacaoId === d.solicitacaoId)) continue;
                vinculos.push({ criadoEm: new Date(), ...d });
                count += 1;
            }
            return { count };
        },
        findMany: async ({ where }) => vinculos.filter((v) => {
            if (where?.mensagemId?.in && !where.mensagemId.in.includes(v.mensagemId)) return false;
            if (where?.solicitacaoId?.in && !where.solicitacaoId.in.includes(v.solicitacaoId)) return false;
            return true;
        }).map((v) => {
            const m = mensagens.find((x) => x.id === v.mensagemId);
            return { ...v, mensagem: m ? { conversaId: m.conversaId } : null };
        }),
    };

    const lukeEventoModel = {
        createMany: async ({ data, skipDuplicates }) => {
            let count = 0;
            for (const d of data) {
                if (skipDuplicates && eventos.some((e) => e.chaveDedupe === d.chaveDedupe)) continue;
                eventos.push({ tentativas: 0, criadoEm: new Date(), ...d });
                count += 1;
            }
            return { count };
        },
        updateMany: async () => ({ count: 0 }),
        findMany: async () => [],
    };

    const prisma = makeMockPrisma({
        vendedor: {
            findUnique: async ({ where }) => vendedores.get(where.id) || null,
            findMany: async ({ where }) => [...vendedores.values()].filter((v) => !where?.id?.in || where.id.in.includes(v.id)),
        },
        agenteToken: {
            findUnique: async ({ where }) => {
                const t = where.hash ? [...tokens.values()].find((x) => x.hash === where.hash) : tokens.get(where.id);
                return t ? { ...t, vendedor: vendedores.get(t.vendedorId) } : null;
            },
            update: async ({ where, data }) => Object.assign(tokens.get(where.id), data),
        },
        agentePolitica: { findMany: async () => [] },
        agenteSolicitacao: {
            count: async () => solicitacoes.filter((s) => s.status === 'PENDENTE').length,
            findMany: async ({ where }) => solicitacoes.filter((s) => {
                if (where?.id?.in && !where.id.in.includes(s.id)) return false;
                if (where?.agenteId && s.agenteId !== where.agenteId) return false;
                return true;
            }),
        },
        appConfig: {
            findUnique: async ({ where }) => (configs.has(where.key) ? { key: where.key, value: configs.get(where.key) } : null),
            upsert: async ({ where, create, update }) => {
                if (!configs.has(where.key)) configs.set(where.key, create.value);
                else if (update && update.value !== undefined) configs.set(where.key, update.value);
                return { key: where.key, value: configs.get(where.key) };
            },
        },
        chatLukeConversa: chatLukeConversaModel,
        chatLukeMensagem: chatLukeMensagemModel,
        chatLukeMensagemSolicitacao: vinculoModel,
        chatLukeLimite: {
            findUnique: async ({ where }) => limites.get(where.usuarioId) || null,
            findMany: async () => [...limites.values()],
            upsert: async ({ where, create, update }) => {
                const cur = limites.get(where.usuarioId);
                const row = cur ? { ...cur, ...update, atualizadoEm: new Date() } : { ...create, atualizadoEm: new Date() };
                limites.set(where.usuarioId, row);
                return row;
            },
            deleteMany: async ({ where }) => ({ count: limites.delete(where.usuarioId) ? 1 : 0 }),
        },
        lukeWebhookEvento: lukeEventoModel,
        anexo: {
            create: async ({ data }) => {
                const row = { id: crypto.randomUUID(), ativo: true, criadoEm: new Date(), ...data };
                anexos.push(row);
                return { ...row };
            },
            findMany: async ({ where }) => anexos.filter((a) => {
                if (where?.ativo !== undefined && a.ativo !== where.ativo) return false;
                if (where?.entidadeTipo && typeof where.entidadeTipo === 'string' && a.entidadeTipo !== where.entidadeTipo) return false;
                if (where?.entidadeId?.in && !where.entidadeId.in.includes(a.entidadeId)) return false;
                if (where?.sha256 && a.sha256 !== where.sha256) return false;
                if (where?.NOT?.id && a.id === where.NOT.id) return false;
                if (where?.criadoPorId && a.criadoPorId !== where.criadoPorId) return false;
                return true;
            }),
            findUnique: async ({ where }) => anexos.find((a) => a.id === where.id) || null,
            update: async ({ where, data }) => {
                const a = anexos.find((x) => x.id === where.id);
                Object.assign(a, data);
                return { ...a };
            },
            count: async ({ where }) => anexos.filter((a) => a.caminho === where.caminho && a.ativo === true).length,
        },
        iaUsoLog: {
            count: async ({ where }) => iaLogs.filter((l) => l.origem === where.origem && l.usuarioId === where.usuarioId).length,
        },
        auditLog: { create: async ({ data }) => { audits.push(data); return data; } },
        $transaction: async (fn) => fn({
            chatLukeMensagem: chatLukeMensagemModel,
            chatLukeConversa: chatLukeConversaModel,
            chatLukeMensagemSolicitacao: vinculoModel,
            lukeWebhookEvento: lukeEventoModel,
        }),
    });

    return { addVendedor, addToken, configs, conversas, mensagens, vinculos, anexos, eventos, solicitacoes, iaLogs, audits, prisma };
}

function montarMultipart(campos, arquivos) {
    const boundary = '----CAHardtTest' + crypto.randomBytes(8).toString('hex');
    const partes = [];
    for (const [k, v] of Object.entries(campos || {})) {
        partes.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`, 'utf8'));
    }
    for (const f of arquivos || []) {
        partes.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="arquivos"; filename="${f.nome}"\r\nContent-Type: ${f.mime}\r\n\r\n`, 'utf8'));
        partes.push(f.conteudo);
        partes.push(Buffer.from('\r\n', 'utf8'));
    }
    partes.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
    return { body: Buffer.concat(partes), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function postarMultipart(baseUrl, caminho, headers, campos, arquivos) {
    const mp = montarMultipart(campos, arquivos);
    const res = await fetch(`${baseUrl}${caminho}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': mp.contentType },
        body: mp.body,
    });
    const body = await res.json();
    return { status: res.status, body };
}

test('ChatLuke B1: permissões, isolamento entre usuários, agente habilitado, upload seguro (JPG/PDF vs EXE/HEIC), idempotência, limites diários, vínculo de solicitação e bloqueio em /api/anexos', async () => {
    const mem = criarBancoChat();
    const luketok = `cah_ag_${crypto.randomBytes(32).toString('base64url')}`;
    const outrotok = `cah_ag_${crypto.randomBytes(32).toString('base64url')}`;
    const SOL_ID = '11111111-2222-3333-4444-555555555555';

    mem.addVendedor({ id: 'adm', nome: 'Clark', permissoes: { admin: true } });
    mem.addVendedor({ id: 'ana', nome: 'Ana Escritório', permissoes: { Pode_Usar_Chat_Luke: true } });
    mem.addVendedor({ id: 'beto', nome: 'Beto', permissoes: { Pode_Usar_Chat_Luke: true } });
    mem.addVendedor({ id: 'ze', nome: 'Zé Sem Chat', permissoes: { clientes: { view: true } } });
    mem.addVendedor({ id: 'luke', nome: 'Luke (agente)', agente: true, acessoExterno: true, permissoes: {} });
    mem.addVendedor({ id: 'outro-ag', nome: 'Outro Agente', agente: true, acessoExterno: true, permissoes: {} });
    mem.addToken({ vendedorId: 'luke', hash: hash(luketok), prefixo: luketok.slice(7, 15) });
    mem.addToken({ vendedorId: 'outro-ag', hash: hash(outrotok), prefixo: outrotok.slice(7, 15) });
    mem.solicitacoes.push({ id: SOL_ID, agenteId: 'luke', status: 'PENDENTE', resumo: 'Criar conta a pagar R$ 250', expiraEm: new Date(Date.now() + 3600000) });

    delete process.env.LUKE_WEBHOOK_URL;
    delete process.env.LUKE_WEBHOOK_SECRET;

    const restaurar = stubModule(DATABASE_MODULE, mem.prisma);
    limparCacheContendo(...CACHE);
    const authMiddleware = require('../middlewares/authMiddleware');
    const chatRoutes = require('../routes/chatLukeRoutes');
    const agenteChatRoutes = require('../routes/agenteChatV1Routes');
    const agenteApiRoutes = require('../routes/agenteApiV1Routes');
    const anexosRoutes = require('../routes/anexos');
    const chatSvc = require('../services/chatLukeService');
    const anexoSvc = require('../services/anexoService');
    restaurar();

    const app = express();
    app.use(express.json());
    app.use('/api/chat-luke', authMiddleware, chatRoutes);
    app.use('/api/agente/v1/chat', authMiddleware, agenteChatRoutes);
    app.use('/api/agente/v1', authMiddleware, agenteApiRoutes);
    app.use('/api', anexosRoutes);
    const srv = await startTestServer(app);

    const H_ADM = { authorization: `Bearer ${jwt.sign({ id: 'adm', nome: 'Clark' }, process.env.JWT_SECRET)}` };
    const H_ANA = { authorization: `Bearer ${jwt.sign({ id: 'ana', nome: 'Ana Escritório' }, process.env.JWT_SECRET)}` };
    const H_BETO = { authorization: `Bearer ${jwt.sign({ id: 'beto', nome: 'Beto' }, process.env.JWT_SECRET)}` };
    const H_ZE = { authorization: `Bearer ${jwt.sign({ id: 'ze', nome: 'Zé' }, process.env.JWT_SECRET)}` };
    const H_LUKE = { authorization: `Bearer ${luketok}` };
    const H_OUTRO = { authorization: `Bearer ${outrotok}` };

    const arquivosCriados = [];

    try {
        // 1) Sem permissão -> 403 em todas as rotas JWT; token de agente em /api/chat-luke -> 403; JWT em /api/agente/v1/chat -> 403
        for (const [m, p] of [['GET', '/resumo'], ['GET', '/conversa'], ['GET', '/mensagens'], ['POST', '/mensagens'], ['POST', '/lida'], ['GET', '/nao-lidas']]) {
            assert.equal((await srv.request(m, `/api/chat-luke${p}`, { headers: H_ZE, body: m === 'POST' ? { texto: 'oi' } : undefined })).status, 403, `Zé em ${p}`);
        }
        assert.equal((await srv.request('GET', '/api/chat-luke/conversa', { headers: H_LUKE })).status, 403);
        assert.equal((await srv.request('GET', '/api/agente/v1/chat/conversas', { headers: H_ANA })).status, 403);

        // 2) Agente antes de configurar -> 403 AGENTE_CHAT_NAO_HABILITADO; token na URL -> 400 TOKEN_NA_URL
        const semCfg = await srv.request('GET', '/api/agente/v1/chat/conversas', { headers: H_LUKE });
        assert.equal(semCfg.status, 403);
        assert.equal(semCfg.body.codigo, 'AGENTE_CHAT_NAO_HABILITADO');
        const tokUrl = await srv.request('GET', `/api/agente/v1/chat/conversas?token=${luketok}`, { headers: H_LUKE });
        assert.equal(tokUrl.status, 400);
        assert.equal(tokUrl.body.codigo, 'TOKEN_NA_URL');

        // 3) Admin configura o agente 'luke' e limite apertado (pedidosDia: 2, anexosDia: 2, duvidasDia: 1)
        const cfg = await srv.request('PUT', '/api/chat-luke/config', {
            headers: H_ADM,
            body: { agenteId: 'luke', ativo: true, limites: { pedidosDia: 2, anexosDia: 2, duvidasDia: 1 } },
        });
        assert.equal(cfg.status, 200);

        // Outro agente continua bloqueado (403 AGENTE_CHAT_NAO_HABILITADO)
        assert.equal((await srv.request('GET', '/api/agente/v1/chat/conversas', { headers: H_OUTRO })).status, 403);

        // 4) Upload inválido (.exe renomeado para .jpg e HEIC) -> 415 sem gravar anexo nem mensagem
        const exeFalso = Buffer.from('MZ\x90\x00\x03\x00\x00\x00executavel-disfarcado', 'latin1');
        const rExe = await postarMultipart(srv.baseUrl, '/api/chat-luke/mensagens', H_ANA, { texto: 'segue foto' }, [
            { nome: 'virus.jpg', mime: 'image/jpeg', conteudo: exeFalso },
        ]);
        assert.equal(rExe.status, 415);
        assert.equal(mem.anexos.length, 0);
        assert.equal(mem.mensagens.length, 0);

        const heicBuf = Buffer.from('\x00\x00\x00\x18ftypheic\x00\x00\x00\x00heicmif1', 'latin1');
        const rHeic = await postarMultipart(srv.baseUrl, '/api/chat-luke/mensagens', H_ANA, { texto: 'foto iphone' }, [
            { nome: 'foto.jpg', mime: 'image/jpeg', conteudo: heicBuf },
        ]);
        assert.equal(rHeic.status, 415);
        assert.equal(rHeic.body.codigo, 'TIPO_NAO_ACEITO');

        // 5) Envio válido com PDF + Idempotency-Key (repetição devolve 200 duplicada=true sem gastar 2º pedido!)
        const pdfMinimo = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n', 'latin1');
        const r1 = await postarMultipart(
            srv.baseUrl, '/api/chat-luke/mensagens',
            { ...H_ANA, 'Idempotency-Key': 'msg-ana-001' },
            { texto: 'Paguei este boleto hoje', assunto: 'LANCAMENTO' },
            [{ nome: 'boleto.pdf', mime: 'application/pdf', conteudo: pdfMinimo }]
        );
        assert.equal(r1.status, 201);
        assert.equal(r1.body.duplicada, false);
        assert.equal(r1.body.mensagem.qtdAnexos, 1);
        const anexoId = r1.body.mensagem.anexos[0].id;
        const msgId = r1.body.mensagem.id;
        const convId = r1.body.mensagem.conversaId;
        const anexoSalvo = mem.anexos[0];
        arquivosCriados.push(path.join(RAIZ, 'uploads', anexoSalvo.caminho));

        const r1Replay = await postarMultipart(
            srv.baseUrl, '/api/chat-luke/mensagens',
            { ...H_ANA, 'Idempotency-Key': 'msg-ana-001' },
            { texto: 'Paguei este boleto hoje', assunto: 'LANCAMENTO' },
            [{ nome: 'boleto.pdf', mime: 'application/pdf', conteudo: pdfMinimo }]
        );
        assert.equal(r1Replay.status, 200);
        assert.equal(r1Replay.body.duplicada, true);
        assert.equal(mem.mensagens.length, 1);

        // Evento de webhook chat.mensagem nasceu MAGRO (sem texto e sem nome!)
        assert.equal(mem.eventos.length, 1);
        assert.equal(JSON.stringify(mem.eventos[0]).includes('Paguei este boleto'), false);
        assert.equal(JSON.stringify(mem.eventos[0]).includes('Ana Escritório'), false);

        // 6) Isolamento de anexos: Ana baixa (200), Luke baixa (200), Beto recebe 404, e ADMIN em /api/anexos/:id/arquivo recebe 403!
        const dlAna = await fetch(`${srv.baseUrl}/api/chat-luke/anexos/${anexoId}`, { headers: H_ANA });
        assert.equal(dlAna.status, 200);
        assert.equal(dlAna.headers.get('x-content-type-options'), 'nosniff');

        const dlLuke = await fetch(`${srv.baseUrl}/api/agente/v1/chat/anexos/${anexoId}`, { headers: H_LUKE });
        assert.equal(dlLuke.status, 200);

        const dlBeto = await srv.request('GET', `/api/chat-luke/anexos/${anexoId}`, { headers: H_BETO });
        assert.equal(dlBeto.status, 404);

        const dlRotaGeralAdmin = await srv.request('GET', `/api/anexos/${anexoId}/arquivo`, { headers: H_ADM });
        assert.equal(dlRotaGeralAdmin.status, 403, 'nem admin abre CHAT_LUKE por /api/anexos');

        // 7) Limite diário: Ana envia 2ª mensagem (ok, atinge pedidosDia=2); na 3ª recebe 429 CHAT_LIMITE_DIA e nada é gravado!
        const r2 = await srv.request('POST', '/api/chat-luke/mensagens', { headers: H_ANA, body: { texto: 'Segunda mensagem do dia' } });
        assert.equal(r2.status, 201);
        const r3 = await srv.request('POST', '/api/chat-luke/mensagens', { headers: H_ANA, body: { texto: 'Terceira bloqueada' } });
        assert.equal(r3.status, 429);
        assert.equal(r3.body.codigo, 'CHAT_LIMITE_DIA');
        assert.equal(mem.mensagens.length, 2);

        // Limite de dúvidas da ajuda: 1 uso registrado -> checarLimiteDuvidas vira ok:false para Ana, mas continua ok:true para Admin
        mem.iaLogs.push({ origem: 'CLIPPY', usuarioId: 'ana', criadoEm: new Date() });
        assert.equal((await chatSvc.checarLimiteDuvidas('ana', { Pode_Usar_Chat_Luke: true })).ok, false);
        assert.equal((await chatSvc.checarLimiteDuvidas('adm', { admin: true })).ok, true);

        // 8) Vínculo X-Origem-* + resposta do Luke (POST /api/agente/v1/chat/conversas/:id/mensagens liberado na política, sem gerar webhook!)
        const vinc = await chatSvc.vincularOrigem(SOL_ID, { conversaId: convId, mensagemId: msgId }, 'luke');
        assert.equal(vinc.vinculado, true);
        // UUID inexistente não lança
        const vincInvalido = await chatSvc.vincularOrigem(SOL_ID, { conversaId: '00000000-0000-0000-0000-000000000000', mensagemId: msgId }, 'luke');
        assert.equal(vincInvalido.vinculado, false);

        const eventosAntes = mem.eventos.length;
        const respLuke = await srv.request('POST', `/api/agente/v1/chat/conversas/${convId}/mensagens`, {
            headers: { ...H_LUKE, 'Idempotency-Key': 'resp-luke-01' },
            body: { texto: 'Deixei a despesa pronta aguardando autorização do Clark.', solicitacaoIds: [SOL_ID], respondeA: msgId },
        });
        assert.equal(respLuke.status, 201, JSON.stringify(respLuke.body));
        assert.equal(respLuke.body.mensagem.estado, 'AGUARDANDO_AUTORIZACAO');
        assert.equal(mem.eventos.length, eventosAntes, 'resposta do Luke nunca gera evento de webhook');

        // 9) Arquivo apagado do disco -> 404 ARQUIVO_PERDIDO (nunca 500)
        for (const arq of arquivosCriados) { try { fs.unlinkSync(arq); } catch (_) {} }
        const dlPerdido = await srv.request('GET', `/api/chat-luke/anexos/${anexoId}`, { headers: H_ANA });
        assert.equal(dlPerdido.status, 404);
        assert.equal(dlPerdido.body.codigo, 'ARQUIVO_PERDIDO');
    } finally {
        for (const arq of arquivosCriados) { try { fs.unlinkSync(arq); } catch (_) {} }
        chatSvc._resetarParaTeste();
        await srv.close();
    }
});

test('Adendo B1: POST /api/copiloto/chat aplica limite diário de dúvidas (429 AJUDA_LIMITE_DIA) e copilotoService envia lista de telas sem acesso sem passo a passo', async () => {
    const mem = criarBancoChat();
    mem.addVendedor({ id: 'adm', nome: 'Clark', permissoes: { admin: true } });
    mem.addVendedor({ id: 'ze', nome: 'Zé Vendedor', permissoes: { clientes: { view: true } } });
    mem.configs.set('chat_luke', { agenteId: null, ativo: true, limites: { pedidosDia: 20, anexosDia: 30, duvidasDia: 1 } });

    const aiModulePath = path.join(RAIZ, 'services/aiProvider.js');
    const sistemasEnviados = [];
    const restaurarDb = stubModule(DATABASE_MODULE, mem.prisma);
    const restaurarAi = stubModule(aiModulePath, {
        isConfigured: () => true,
        providerAtual: () => 'mock',
        modeloAtual: () => 'mock-1',
        gerarTexto: async ({ system, uso }) => {
            sistemasEnviados.push(system);
            mem.iaLogs.push({ origem: uso.origem, usuarioId: uso.usuarioId, criadoEm: new Date() });
            return {
                texto: JSON.stringify({
                    resposta: 'A função Contas a Pagar existe no sistema, mas seu usuário não tem acesso. Peça ao administrador.',
                    atalhos: [{ label: 'Contas a Pagar', rota: '/financeiro/contas-pagar' }], // rota sem acesso deve ser filtrada!
                }),
                modelo: 'mock-1',
                provider: 'mock',
            };
        },
    });
    limparCacheContendo(...CACHE, 'routes/copiloto.js', 'services/copilotoService.js');
    const authMiddleware = require('../middlewares/authMiddleware');
    const copilotoRoutes = require('../routes/copiloto');
    const chatSvc = require('../services/chatLukeService');
    restaurarAi();
    restaurarDb();

    const app = express();
    app.use(express.json());
    app.use('/api/copiloto', authMiddleware, copilotoRoutes);
    const srv = await startTestServer(app);
    const H_ZE = { authorization: `Bearer ${jwt.sign({ id: 'ze', nome: 'Zé Vendedor' }, process.env.JWT_SECRET)}` };

    try {
        // 1ª dúvida passa: system prompt contém TELAS QUE EXISTEM MAS ESTE USUÁRIO NÃO PODE ACESSAR e filtra atalho proibido
        const r1 = await srv.request('POST', '/api/copiloto/chat', { headers: H_ZE, body: { pergunta: 'Como lançar contas a pagar?' } });
        assert.equal(r1.status, 200);
        assert.deepEqual(r1.body.atalhos, [], 'atalho para tela sem permissão nunca passa');
        assert.ok(sistemasEnviados[0].includes('TELAS QUE EXISTEM MAS ESTE USUÁRIO NÃO PODE ACESSAR'));
        assert.ok(sistemasEnviados[0].includes('Contas a Pagar'));
        assert.equal(sistemasEnviados[0].includes('/financeiro/contas-pagar'), false, 'rota não acessível não vai no prompt');

        // 2ª dúvida do dia estoura duvidasDia=1 -> 429 AJUDA_LIMITE_DIA sem chamar IA!
        const r2 = await srv.request('POST', '/api/copiloto/chat', { headers: H_ZE, body: { pergunta: 'Outra pergunta' } });
        assert.equal(r2.status, 429);
        assert.equal(r2.body.codigo, 'AJUDA_LIMITE_DIA');
        assert.equal(sistemasEnviados.length, 1);
    } finally {
        chatSvc._resetarParaTeste();
        await srv.close();
    }
});

test('Ajustes: resposta do Luke resolve mensagem em ERRO (só a alvo / só da própria conversa) e continua resolvendo ENVIADO', async () => {
    const mem = criarBancoChat();
    mem.addVendedor({ id: 'luke', nome: 'Luke (agente)', agente: true, acessoExterno: true, permissoes: {} });
    mem.configs.set('chat_luke', { agenteId: 'luke', ativo: true });
    const CONV_A = crypto.randomUUID();
    const CONV_B = crypto.randomUUID();
    mem.conversas.push({ id: CONV_A, usuarioId: 'ana', ultimaMensagemEm: new Date(), lidaUsuarioEm: null, criadoEm: new Date(), atualizadoEm: new Date() });
    mem.conversas.push({ id: CONV_B, usuarioId: 'beto', ultimaMensagemEm: new Date(), lidaUsuarioEm: null, criadoEm: new Date(), atualizadoEm: new Date() });
    const msg = (id, conversaId, status) => mem.mensagens.push({ id, conversaId, autor: 'USUARIO', usuarioId: conversaId === CONV_A ? 'ana' : 'beto', texto: 'x', tipo: 'TEXTO', status, qtdAnexos: 0, criadoEm: new Date(Date.now() - 60000), atualizadoEm: new Date(), respondeA: null, chaveIdempotencia: null });
    const ID_ERRO_ALVO = crypto.randomUUID();
    const ID_ERRO_OUTRA_MSG = crypto.randomUUID();
    const ID_ERRO_OUTRA_CONV = crypto.randomUUID();
    const ID_ENVIADO = crypto.randomUUID();
    msg(ID_ERRO_ALVO, CONV_A, 'ERRO');
    msg(ID_ERRO_OUTRA_MSG, CONV_A, 'ERRO');
    msg(ID_ERRO_OUTRA_CONV, CONV_B, 'ERRO');
    msg(ID_ENVIADO, CONV_A, 'ENVIADO');
    const st = (id) => mem.mensagens.find((m) => m.id === id).status;

    const restaurar = stubModule(DATABASE_MODULE, mem.prisma);
    limparCacheContendo(...CACHE);
    const chatSvc = require('../services/chatLukeService');
    restaurar();
    try {
        const agente = { id: 'luke', nome: 'Luke (agente)' };
        // com respondeA: só a mensagem alvo (que estava em ERRO) vira RESPONDIDO
        const r = await chatSvc.responderComoLuke({ agente, conversaId: CONV_A, corpo: { texto: 'Recebi seu pedido pelo polling.', respondeA: ID_ERRO_ALVO }, chaveIdempotencia: 'ajuste-1' });
        assert.equal(r.duplicada, false);
        assert.equal(st(ID_ERRO_ALVO), 'RESPONDIDO');
        assert.equal(st(ID_ERRO_OUTRA_MSG), 'ERRO', 'outra mensagem ERRO da mesma conversa não é o alvo');
        assert.equal(st(ID_ERRO_OUTRA_CONV), 'ERRO', 'ERRO de outra conversa intocado');
        assert.equal(st(ID_ENVIADO), 'ENVIADO', 'mensagem não-alvo não muda quando vem respondeA');

        // sem respondeA: resolve ENVIADO e ERRO da própria conversa, nunca de outra conversa
        await chatSvc.responderComoLuke({ agente, conversaId: CONV_A, corpo: { texto: 'Resposta geral.' }, chaveIdempotencia: 'ajuste-2' });
        assert.equal(st(ID_ENVIADO), 'RESPONDIDO');
        assert.equal(st(ID_ERRO_OUTRA_MSG), 'RESPONDIDO');
        assert.equal(st(ID_ERRO_OUTRA_CONV), 'ERRO', 'ERRO de outra conversa continua intocado');
    } finally {
        chatSvc._resetarParaTeste();
    }
});

test('Ajustes: orientação "Pedir ao Luke" na ajuda só aparece com chat configurado+ligado e usuário com permissão', async () => {
    const mem = criarBancoChat();
    mem.addVendedor({ id: 'adm', nome: 'Clark', permissoes: { admin: true } });
    const sistemas = [];
    const restaurarDb = stubModule(DATABASE_MODULE, mem.prisma);
    const restaurarAi = stubModule(path.join(RAIZ, 'services/aiProvider.js'), {
        isConfigured: () => true, providerAtual: () => 'mock', modeloAtual: () => 'mock-1',
        gerarTexto: async ({ system }) => { sistemas.push(system); return { texto: JSON.stringify({ resposta: 'ok', atalhos: [] }), modelo: 'mock-1', provider: 'mock' }; },
    });
    limparCacheContendo(...CACHE, 'services/copilotoService.js');
    const chatSvc = require('../services/chatLukeService');
    const copiloto = require('../services/copilotoService');
    restaurarAi();
    restaurarDb();
    const perguntar = async (perms) => {
        chatSvc._resetarParaTeste();
        sistemas.length = 0;
        await copiloto.responderAjuda({ pergunta: 'Como lançar uma conta a pagar?', perms, usuarioId: 'u', usuarioNome: 'U' });
        return sistemas[0];
    };
    try {
        const FIN = 'encaminhar ao setor financeiro';
        const LUKE = 'Pedir ao Luke';
        // sem config (agenteId ausente): admin NÃO recebe a orientação do Luke
        assert.ok((await perguntar({ admin: true })).includes(FIN));
        assert.equal((await perguntar({ admin: true })).includes(LUKE), false);
        // agente configurado mas chat desligado
        mem.configs.set('chat_luke', { agenteId: 'luke', ativo: false });
        assert.equal((await perguntar({ admin: true })).includes(LUKE), false);
        // configurado e ligado: admin e usuário com permissão recebem; usuário sem permissão não
        mem.configs.set('chat_luke', { agenteId: 'luke', ativo: true });
        assert.ok((await perguntar({ admin: true })).includes(LUKE));
        assert.ok((await perguntar({ Pode_Usar_Chat_Luke: true })).includes(LUKE));
        const semPerm = await perguntar({ clientes: { view: true } });
        assert.equal(semPerm.includes(LUKE), false);
        assert.ok(semPerm.includes(FIN));
        // falha ao ler a config: não inclui (e não derruba a ajuda)
        const originalGet = mem.configs.get.bind(mem.configs);
        mem.configs.get = () => { throw new Error('banco fora'); };
        const falhou = await perguntar({ admin: true });
        mem.configs.get = originalGet;
        assert.equal(falhou.includes(LUKE), false);
        assert.ok(falhou.includes(FIN));
    } finally {
        chatSvc._resetarParaTeste();
    }
});
