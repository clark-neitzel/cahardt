const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const verificarAuth = require('../middlewares/authMiddleware');
const cobrancaService = require('../services/cobrancaService');

const getPerms = async (userId) => {
    const vendedor = await prisma.vendedor.findUnique({
        where: { id: userId },
        select: { permissoes: true }
    });
    return typeof vendedor?.permissoes === 'string'
        ? JSON.parse(vendedor.permissoes)
        : (vendedor?.permissoes || {});
};

// Ver: Pode_Acessar_Cobranca (ou editar, que inclui ver). Editar: Pode_Editar_Cobranca.
const checkAcesso = async (req, res, next) => {
    const perms = req._perms || await getPerms(req.user.id);
    req._perms = perms;
    if (!perms.admin && !perms.Pode_Acessar_Cobranca && !perms.Pode_Editar_Cobranca) {
        return res.status(403).json({ error: 'Sem permissão para acessar a régua de cobrança.' });
    }
    next();
};

// Toda rota de escrita (ligar/desligar, configurar, executar, cobrar, canais) exige editar.
// GET e o preview de mensagem continuam liberados para quem só visualiza.
const checkEdicao = (req, res, next) => {
    if (req.method === 'GET' || req.path === '/preview') return next();
    const perms = req._perms || {};
    if (!perms.admin && !perms.Pode_Editar_Cobranca) {
        return res.status(403).json({ error: 'Você tem acesso somente de visualização à régua de cobrança.' });
    }
    next();
};

router.use(verificarAuth, checkAcesso, checkEdicao);

// ── Painel de inadimplentes ──────────────────────────────────────────
router.get('/painel', async (req, res) => {
    try {
        const painel = await cobrancaService.painelInadimplentes();
        res.json({ ...painel, execucao: cobrancaService.getStatusExecucao() });
    } catch (e) {
        console.error('[Cobranca] Erro no painel:', e);
        res.status(500).json({ error: 'Erro ao montar o painel de inadimplentes.' });
    }
});

// ── Configurações por forma de recebimento ───────────────────────────
router.get('/configs', async (req, res) => {
    try {
        const configs = await prisma.cobrancaConfig.findMany({
            include: { responsavelTarefa: { select: { id: true, nome: true } } },
            orderBy: { formaRecebimento: 'asc' }
        });
        res.json({ configs, templatesPadrao: cobrancaService.TEMPLATES_PADRAO, modelos: cobrancaService.MODELOS_PRONTOS });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao listar configurações.' });
    }
});

const camposConfig = (body) => ({
    formaRecebimento: String(body.formaRecebimento || '').trim(),
    ativo: body.ativo !== false,
    diasPrimeiroAviso: Math.max(0, parseInt(body.diasPrimeiroAviso ?? 1, 10) || 0),
    repetirCadaDias: Math.max(1, parseInt(body.repetirCadaDias ?? 7, 10) || 7),
    maxAvisos: Math.max(1, parseInt(body.maxAvisos ?? 5, 10) || 5),
    enviarVencida: body.enviarVencida !== false,
    lembreteAntes: body.lembreteAntes === true,
    diasLembrete: Math.max(1, parseInt(body.diasLembrete ?? 3, 10) || 3),
    canalWhatsapp: body.canalWhatsapp !== false,
    canalEmail: body.canalEmail === true,
    canalSms: body.canalSms === true,
    templates: Array.isArray(body.templates)
        ? body.templates.filter(t => t && t.texto).map(t => {
            const deDias = parseInt(t.deDias, 10);
            const ateDias = parseInt(t.ateDias, 10);
            return {
                nome: String(t.nome || '').slice(0, 60),
                texto: String(t.texto).slice(0, 2000),
                deDias: Number.isFinite(deDias) ? Math.max(0, deDias) : null,
                ateDias: Number.isFinite(ateDias) ? Math.max(0, ateDias) : null
            };
        })
        : [],
    templateLembrete: body.templateLembrete ? String(body.templateLembrete).slice(0, 2000) : null,
    responsavelTarefaId: body.responsavelTarefaId || null,
    horaEnvio: /^\d{2}:\d{2}$/.test(body.horaEnvio || '') ? body.horaEnvio : null
});

router.post('/configs', async (req, res) => {
    try {
        const dados = camposConfig(req.body);
        if (!dados.formaRecebimento) return res.status(400).json({ error: 'Informe a forma de recebimento.' });
        const existente = await prisma.cobrancaConfig.findUnique({ where: { formaRecebimento: dados.formaRecebimento } });
        if (existente) return res.status(400).json({ error: 'Já existe configuração para esta forma de recebimento.' });
        const config = await prisma.cobrancaConfig.create({ data: dados });
        res.json({ config });
    } catch (e) {
        console.error('[Cobranca] Erro ao criar config:', e);
        res.status(500).json({ error: 'Erro ao criar configuração.' });
    }
});

router.put('/configs/:id', async (req, res) => {
    try {
        const dados = camposConfig(req.body);
        if (!dados.formaRecebimento) return res.status(400).json({ error: 'Informe a forma de recebimento.' });
        const config = await prisma.cobrancaConfig.update({ where: { id: req.params.id }, data: dados });
        res.json({ config });
    } catch (e) {
        console.error('[Cobranca] Erro ao atualizar config:', e);
        res.status(500).json({ error: 'Erro ao atualizar configuração.' });
    }
});

router.delete('/configs/:id', async (req, res) => {
    try {
        // Preserva o histórico de envios: só desvincula a config
        await prisma.cobrancaEnvio.updateMany({ where: { configId: req.params.id }, data: { configId: null } });
        await prisma.cobrancaConfig.delete({ where: { id: req.params.id } });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao excluir configuração.' });
    }
});

// ── Opções para os seletores ─────────────────────────────────────────
// Formas de recebimento: condições ATIVAS das tabelas de preço + PADRAO.
// É o TabelaPreco.nomeCondicao que abastece o pedido.nomeCondicaoPagamento —
// o mesmo nome que aparece na coluna "Forma" do painel de inadimplentes.
router.get('/formas', async (req, res) => {
    try {
        const condicoes = await prisma.tabelaPreco.findMany({
            where: { ativo: true },
            select: { nomeCondicao: true },
            distinct: ['nomeCondicao'],
            orderBy: { nomeCondicao: 'asc' }
        });
        const nomes = new Set(['PADRAO']);
        condicoes.forEach(c => c.nomeCondicao && nomes.add(c.nomeCondicao));
        res.json({ formas: [...nomes].sort((a, b) => (a === 'PADRAO' ? -1 : b === 'PADRAO' ? 1 : a.localeCompare(b))) });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao listar formas de recebimento.' });
    }
});

// Usuários ativos (seletor de responsável pela tarefa de falha)
router.get('/equipe', async (req, res) => {
    try {
        const equipe = await prisma.vendedor.findMany({
            where: { ativo: true, acessoExterno: false },
            select: { id: true, nome: true },
            orderBy: { nome: 'asc' }
        });
        res.json({ equipe });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao listar equipe.' });
    }
});

// ── Histórico de envios ──────────────────────────────────────────────
router.get('/envios', async (req, res) => {
    try {
        const { clienteId, canal, status, tipo, de, ate } = req.query;
        const pagina = Math.max(1, parseInt(req.query.pagina || 1, 10));
        const porPagina = 50;
        const where = {
            ...(clienteId ? { clienteId } : {}),
            ...(canal ? { canal } : {}),
            ...(status ? { status } : {}),
            ...(tipo ? { tipo } : {}),
            ...(de || ate ? {
                createdAt: {
                    ...(de ? { gte: new Date(`${de}T00:00:00`) } : {}),
                    ...(ate ? { lte: new Date(`${ate}T23:59:59`) } : {})
                }
            } : {})
        };
        const [total, envios] = await Promise.all([
            prisma.cobrancaEnvio.count({ where }),
            prisma.cobrancaEnvio.findMany({
                where,
                include: {
                    cliente: { select: { UUID: true, Nome: true, NomeFantasia: true } },
                    config: { select: { formaRecebimento: true } }
                },
                orderBy: { createdAt: 'desc' },
                skip: (pagina - 1) * porPagina,
                take: porPagina
            })
        ]);
        res.json({ total, pagina, porPagina, envios });
    } catch (e) {
        console.error('[Cobranca] Erro no histórico:', e);
        res.status(500).json({ error: 'Erro ao listar envios.' });
    }
});

// ── Ações ────────────────────────────────────────────────────────────
router.post('/executar', async (req, res) => {
    try {
        const status = cobrancaService.getStatusExecucao();
        if (status.executando) {
            return res.json({ ok: false, motivo: `Fila já em andamento (${status.processados}/${status.total})` });
        }
        // A fila envia 1 mensagem por minuto — roda em segundo plano e a
        // resposta volta na hora (acompanhe pelo painel/histórico)
        cobrancaService.executarRegua({ forcarManual: true })
            .then(r => console.log('[Cobranca] Fila manual concluída:', JSON.stringify(r)))
            .catch(e => console.error('[Cobranca] Fila manual falhou:', e.message));
        res.json({ ok: true, iniciado: true });
    } catch (e) {
        console.error('[Cobranca] Erro ao executar régua:', e);
        res.status(500).json({ error: 'Erro ao executar a régua.' });
    }
});

router.post('/cobrar/:clienteId', async (req, res) => {
    try {
        const r = await cobrancaService.cobrarClienteAgora(req.params.clienteId);
        res.json(r);
    } catch (e) {
        console.error('[Cobranca] Erro ao cobrar cliente:', e);
        res.status(500).json({ error: 'Erro ao enviar cobrança.' });
    }
});

// Preview de template com dados de exemplo
router.post('/preview', (req, res) => {
    res.json({ preview: cobrancaService.previewMensagem(req.body?.texto) });
});

// ── Configuração global (liga/desliga + horário) ─────────────────────
router.get('/config-global', async (req, res) => {
    try {
        const global = await cobrancaService.getCobrancaConfigGlobal();
        res.json(global);
    } catch (e) {
        res.status(500).json({ error: 'Erro ao carregar configuração.' });
    }
});

const DIAS_VALIDOS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

router.post('/config-global', async (req, res) => {
    try {
        const diasSemana = (Array.isArray(req.body?.diasSemana) ? req.body.diasSemana : [])
            .filter(d => DIAS_VALIDOS.includes(d));
        const value = {
            ativo: req.body?.ativo === true,
            horaEnvio: /^\d{2}:\d{2}$/.test(req.body?.horaEnvio || '') ? req.body.horaEnvio : '08:30',
            diasSemana: diasSemana.length ? diasSemana : ['SEG', 'TER', 'QUA', 'QUI', 'SEX'],
            prorrogarFimDeSemana: req.body?.prorrogarFimDeSemana !== false
        };
        await prisma.appConfig.upsert({
            where: { key: 'cobranca_config' },
            update: { value },
            create: { key: 'cobranca_config', value }
        });
        res.json({ ok: true, ...value });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao salvar configuração.' });
    }
});

// ── Canais: e-mail (SMTP) e SMS ──────────────────────────────────────
const MASCARA_SENHA = '********';

router.get('/canais', async (req, res) => {
    try {
        const [emailRow, smsRow] = await Promise.all([
            prisma.appConfig.findUnique({ where: { key: 'email_config' } }),
            prisma.appConfig.findUnique({ where: { key: 'sms_config' } })
        ]);
        const email = emailRow?.value || {};
        const sms = smsRow?.value || {};
        res.json({
            email: { ativo: email.ativo === true, host: email.host || '', port: email.port || 465, secure: email.secure !== false, user: email.user || '', pass: email.pass ? MASCARA_SENHA : '', from: email.from || '', fromName: email.fromName || 'Hardt Salgados' },
            sms: { ativo: sms.ativo === true, provider: sms.provider || 'twilio', accountSid: sms.accountSid || '', authToken: sms.authToken ? MASCARA_SENHA : '', from: sms.from || '' }
        });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao carregar canais.' });
    }
});

router.post('/canais/email', async (req, res) => {
    try {
        const b = req.body || {};
        const atual = (await prisma.appConfig.findUnique({ where: { key: 'email_config' } }))?.value || {};
        const value = {
            ativo: b.ativo === true,
            host: String(b.host || '').trim(),
            port: Number(b.port || 465),
            secure: b.secure !== false,
            user: String(b.user || '').trim(),
            pass: (!b.pass || b.pass === MASCARA_SENHA) ? (atual.pass || '') : String(b.pass),
            from: String(b.from || b.user || '').trim(),
            fromName: String(b.fromName || 'Hardt Salgados').trim()
        };
        await prisma.appConfig.upsert({ where: { key: 'email_config' }, update: { value }, create: { key: 'email_config', value } });
        require('../services/emailService').limparCacheConfig();
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao salvar configuração de e-mail.' });
    }
});

router.post('/canais/email/testar', async (req, res) => {
    try {
        const emailService = require('../services/emailService');
        const conexao = await emailService.testarConexao();
        let envio = null;
        if (conexao.ok && req.body?.para) {
            envio = await emailService.enviar(req.body.para, 'Teste — Régua de Cobrança Hardt', '<p>E-mail de teste da régua de cobrança. Se você recebeu, o SMTP está funcionando. ✅</p>');
        }
        res.json({ conexao, envio });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao testar e-mail.' });
    }
});

router.post('/canais/sms', async (req, res) => {
    try {
        const b = req.body || {};
        const atual = (await prisma.appConfig.findUnique({ where: { key: 'sms_config' } }))?.value || {};
        const value = {
            ativo: b.ativo === true,
            provider: String(b.provider || 'twilio'),
            accountSid: String(b.accountSid || '').trim(),
            authToken: (!b.authToken || b.authToken === MASCARA_SENHA) ? (atual.authToken || '') : String(b.authToken),
            from: String(b.from || '').trim()
        };
        await prisma.appConfig.upsert({ where: { key: 'sms_config' }, update: { value }, create: { key: 'sms_config', value } });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao salvar configuração de SMS.' });
    }
});

module.exports = router;
