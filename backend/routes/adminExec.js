/**
 * ROTA ADMIN-EXEC
 * Endpoints internos protegidos por ADMIN_SECRET (variável de ambiente).
 * Usados para operações de diagnóstico e manutenção em produção.
 *
 * Header obrigatório: x-admin-secret: <ADMIN_SECRET>
 */
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const prisma = require('../config/database');
const clienteInsightService = require('../services/clienteInsightService');
const orientacaoService = require('../services/orientacaoService');
const estoqueService = require('../services/estoqueService');
const contaAzulService = require('../services/contaAzulService');

// Estado do backfill assíncrono da conta financeira em Contas a Receber (varre em segundo plano)
const _backfillReceber = { rodando: false, progresso: null };
const _backfillLedger = { rodando: false, progresso: null };

// Comparação em tempo constante (evita ataque de timing). Usa hash SHA-256 para
// os buffers terem sempre o mesmo tamanho, sem vazar o comprimento do segredo.
function segredoConfere(recebido, esperado) {
    if (typeof recebido !== 'string' || typeof esperado !== 'string') return false;
    const a = crypto.createHash('sha256').update(recebido).digest();
    const b = crypto.createHash('sha256').update(esperado).digest();
    return crypto.timingSafeEqual(a, b);
}

// Middleware: valida ADMIN_SECRET
router.use((req, res, next) => {
    const esperado = process.env.ADMIN_SECRET;
    // Fail-closed: sem segredo configurado no ambiente, ninguém entra (evita
    // comparar contra undefined e deixar a rota aberta por engano).
    if (!esperado) {
        console.error('[admin-exec] ADMIN_SECRET não configurado no ambiente — acesso bloqueado.');
        return res.status(503).json({ error: 'Servidor sem ADMIN_SECRET configurado.' });
    }
    const secret = req.headers['x-admin-secret'];
    if (!secret || !segredoConfere(String(secret), esperado)) {
        return res.status(401).json({ error: 'Não autorizado.' });
    }
    next();
});

// GET /api/admin-exec/ping
// Verifica se o servidor está respondendo e com as variáveis corretas
router.get('/ping', (req, res) => {
    res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        openaiConfigurada: !!process.env.OPENAI_API_KEY,
        jwtConfigurada: !!process.env.JWT_SECRET,          // termômetro: JWT_SECRET setado no ambiente?
        certEncKeyConfigurada: !!process.env.CERT_ENC_KEY, // idem para a chave do certificado A1
        caClientConfigurada: !!(process.env.CONTA_AZUL_CLIENT_ID && process.env.CONTA_AZUL_CLIENT_SECRET),
        asaasConfigurada: !!process.env.ASAAS_API_KEY,
        asaasWebhookTokenConfigurado: !!process.env.ASAAS_WEBHOOK_TOKEN,
        botWhatsappConfigurado: !!(process.env.BOT_WHATSAPP_URL && process.env.BOT_WHATSAPP_API_KEY),
        node: process.version,
    });
});

// ── Integração Focus NFe ──────────────────────────────────────────

// GET /api/admin-exec/focus-nfe-status — as 4 env vars estão setadas? os tokens autenticam na Focus?
// Não expõe valor de token (só tamanho) e não emite nada: consulta uma ref inexistente
// (404 = autenticou; 403 = token errado) e lista empresas com o token de conta.
router.get('/focus-nfe-status', async (req, res) => {
    const envInfo = (nome) => {
        const v = process.env[nome];
        if (!v) return { configurada: false };
        return {
            configurada: true,
            tamanho: v.length,
            comEspacoNasPontas: v !== v.trim(), // detecta espaço colado no copiar/colar
        };
    };
    const auth = (token) => 'Basic ' + Buffer.from(`${token || ''}:`).toString('base64');
    const testarToken = async (baseUrl, token) => {
        if (!token) return { testado: false, motivo: 'token não configurado' };
        try {
            const r = await fetch(`${baseUrl}/v2/nfe/diag-ref-inexistente`, {
                headers: { Authorization: auth(token.trim()) },
                signal: AbortSignal.timeout(10000),
            });
            // 404 (ref não existe) = token válido; 403/401 = token recusado
            return { testado: true, autenticou: r.status === 404, httpStatus: r.status };
        } catch (e) {
            return { testado: true, autenticou: false, erro: e.message };
        }
    };

    const tokenConta = process.env.FOCUS_NFE_TOKEN_CONTA;
    let conta = { testado: false, motivo: 'token não configurado' };
    if (tokenConta) {
        try {
            // Gestão de empresas é sempre na URL de produção (ver backend/docs/focus-nfe-api.md)
            const r = await fetch('https://api.focusnfe.com.br/v2/empresas', {
                headers: { Authorization: auth(tokenConta.trim()) },
                signal: AbortSignal.timeout(10000),
            });
            const corpo = r.ok ? await r.json() : null;
            conta = {
                testado: true,
                autenticou: r.ok,
                httpStatus: r.status,
                empresasCadastradas: Array.isArray(corpo) ? corpo.map(e => ({ id: e.id, nome: e.nome, cnpj: e.cnpj })) : undefined,
            };
        } catch (e) {
            conta = { testado: true, autenticou: false, erro: e.message };
        }
    }

    res.json({
        ambiente: process.env.FOCUS_NFE_AMBIENTE || '(não configurado)',
        envs: {
            FOCUS_NFE_TOKEN_CONTA: envInfo('FOCUS_NFE_TOKEN_CONTA'),
            FOCUS_NFE_TOKEN_PRODUCAO: envInfo('FOCUS_NFE_TOKEN_PRODUCAO'),
            FOCUS_NFE_TOKEN_HOMOLOGACAO: envInfo('FOCUS_NFE_TOKEN_HOMOLOGACAO'),
            FOCUS_NFE_AMBIENTE: envInfo('FOCUS_NFE_AMBIENTE'),
        },
        testes: {
            tokenConta: conta,
            tokenProducao: await testarToken('https://api.focusnfe.com.br', process.env.FOCUS_NFE_TOKEN_PRODUCAO),
            tokenHomologacao: await testarToken('https://homologacao.focusnfe.com.br', process.env.FOCUS_NFE_TOKEN_HOMOLOGACAO),
        },
    });
});

// POST /api/admin-exec/focus-nfe-webhook-secret — grava o segredo que a Focus
// manda no header x-focus-secret (cadastrado no painel dela em Webhooks).
// Body: { "secret": "..." }. A env FOCUS_NFE_WEBHOOK_SECRET, se setada, tem precedência.
router.post('/focus-nfe-webhook-secret', async (req, res) => {
    try {
        const secret = String(req.body?.secret || '').trim();
        if (secret.length < 16) return res.status(400).json({ error: 'Informe { secret } com pelo menos 16 caracteres.' });
        await prisma.appConfig.upsert({
            where: { key: 'focus_nfe_webhook_secret' },
            update: { value: { secret } },
            create: { key: 'focus_nfe_webhook_secret', value: { secret } },
        });
        res.json({ ok: true, tamanho: secret.length, envTemPrecedencia: !!process.env.FOCUS_NFE_WEBHOOK_SECRET });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/diag-focus-nfe-eventos — últimos eventos recebidos do webhook
// (?ref=... filtra por referência). Não expõe o segredo, só se está configurado.
router.get('/diag-focus-nfe-eventos', async (req, res) => {
    try {
        const where = req.query.ref ? { ref: String(req.query.ref) } : {};
        const eventos = await prisma.focusNfeEvento.findMany({
            where,
            orderBy: { id: 'desc' },
            take: 20,
        });
        const cfg = await prisma.appConfig.findUnique({ where: { key: 'focus_nfe_webhook_secret' } });
        res.json({
            segredoWebhook: process.env.FOCUS_NFE_WEBHOOK_SECRET ? 'env' : (cfg?.value?.secret ? 'app_configs' : 'NÃO CONFIGURADO'),
            total: await prisma.focusNfeEvento.count(),
            eventos,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/focus-nfe-emitir-teste — emite uma NF-e de ENSAIO no ambiente
// configurado (só permite em homologação — sem valor fiscal). Body: { tipo: 'cnpj'|'cpf' }.
// Usa o perfil fiscal real extraído das notas do CA (backend/docs/focus-nfe-api.md, seção 12).
router.post('/focus-nfe-emitir-teste', async (req, res) => {
    try {
        const focusNfe = require('../services/focusNfeService');
        if (focusNfe.ambiente() !== 'homologacao') {
            return res.status(400).json({ error: 'Teste só é permitido com FOCUS_NFE_AMBIENTE=homologacao.' });
        }
        const tipo = req.body?.tipo === 'cpf' ? 'cpf' : 'cnpj';
        // Horário de Brasília de verdade (UTC-3) — mandar UTC etiquetado de -03:00 cai na
        // rejeição 703 "Data-Hora de Emissao posterior ao horario de recebimento".
        const agora = new Date(Date.now() - 3 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, '-03:00');

        const emitente = {
            cnpj_emitente: '08766459000102',
            nome_emitente: 'HARDT DOCES E SALGADOS LTDA',
            nome_fantasia_emitente: 'HARDT DOCES E SALGADOS LTDA',
            logradouro_emitente: 'R 15 DE OUTUBRO',
            numero_emitente: '170',
            bairro_emitente: 'RIO BONITO',
            municipio_emitente: 'Joinville',
            uf_emitente: 'SC',
            cep_emitente: '89239700',
            inscricao_estadual_emitente: '255372744',
            regime_tributario_emitente: 1,
        };
        // Em homologação a SEFAZ força este nome no destinatário.
        const destinatario = tipo === 'cpf'
            ? {
                nome_destinatario: 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL',
                cpf_destinatario: '11144477735', // CPF de teste (DV válido)
                indicador_inscricao_estadual_destinatario: 9,
            }
            : {
                nome_destinatario: 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL',
                cnpj_destinatario: '82146549000153', // CNPJ real de cliente (sem efeito em homologação)
                // SC rejeitou indicador 2 (isento) com "IE do destinatario nao informada" —
                // contribuinte com a IE real do cliente, igual às notas do CA.
                indicador_inscricao_estadual_destinatario: 1,
                inscricao_estadual_destinatario: '252073649',
            };
        const enderecoDest = {
            logradouro_destinatario: 'RUA DE TESTE',
            numero_destinatario: '100',
            bairro_destinatario: 'CENTRO',
            municipio_destinatario: 'Joinville',
            uf_destinatario: 'SC',
            cep_destinatario: '89201000',
            pais_destinatario: 'Brasil',
        };

        const valor = 41.66;
        const aliquotaCred = 3.82;
        const item = {
            numero_item: 1,
            codigo_produto: '3086',
            descricao: '3-DOGUINHO 2.SALSICHAS C/08 220GR',
            cfop: '5101',
            codigo_ncm: '19022000',
            unidade_comercial: 'PT',
            unidade_tributavel: 'PT',
            quantidade_comercial: 1,
            quantidade_tributavel: 1,
            valor_unitario_comercial: valor,
            valor_unitario_tributavel: valor,
            valor_bruto: valor,
            inclui_no_total: 1,
            icms_origem: 0,
            pis_situacao_tributaria: '49',
            cofins_situacao_tributaria: '49',
            ...(tipo === 'cpf'
                ? { icms_situacao_tributaria: '102' }
                : {
                    icms_situacao_tributaria: '101',
                    icms_aliquota_credito_simples: aliquotaCred,
                    icms_valor_credito_simples: +(valor * aliquotaCred / 100).toFixed(2),
                }),
        };

        const textosLegais = [
            'DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL.',
            'NAO GERA DIREITO A CREDITO FISCAL DE IPI.',
        ];
        if (tipo === 'cnpj') {
            const vCred = (valor * aliquotaCred / 100).toFixed(2).replace('.', ',');
            textosLegais.push(`PERMITE O APROVEITAMENTO DO CREDITO DE ICMS NO VALOR DE R$ ${vCred}, CORRESPONDENTE A ALIQUOTA DE ${String(aliquotaCred).replace('.', ',')}%, NOS TERMOS DO ART. 23 DA LC 123/2006.`);
        }

        const nota = {
            natureza_operacao: tipo === 'cpf' ? 'Venda a Nao Contribuinte' : 'Venda de Mercadorias / Produtos',
            data_emissao: agora,
            data_entrada_saida: agora,
            tipo_documento: 1,
            finalidade_emissao: 1,
            local_destino: 1,
            consumidor_final: tipo === 'cpf' ? 1 : 0,
            presenca_comprador: 1,
            ...emitente,
            ...destinatario,
            ...enderecoDest,
            modalidade_frete: 0,
            valor_frete: 0,
            valor_seguro: 0,
            valor_desconto: 0,
            valor_outras_despesas: 0,
            valor_produtos: valor,
            valor_total: valor,
            formas_pagamento: [{ forma_pagamento: '01', valor_pagamento: valor }],
            // Separador '#' como o CA fazia: a Focus converte '\n' em '\\n' literal no XML,
            // e a nossa DANFE já converte '#' em quebra de linha (patch da DANFE).
            informacoes_adicionais_contribuinte: ['Referente ao pedido TESTE (nota de ensaio do app)', ...textosLegais].join('#'),
            items: [item],
        };

        const ref = req.body?.ref || `teste-${tipo}-${Date.now()}`;
        const resultado = await focusNfe.emitir(ref, nota);
        res.status(resultado.httpStatus >= 400 ? 502 : 200).json({ ref, ambiente: focusNfe.ambiente(), ...resultado, notaEnviada: nota });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/focus-nfe-homolog-numeracao — ajusta APENAS a numeração de
// HOMOLOGAÇÃO da empresa na Focus (a empresa já testou NF-e em 2014 e a numeração nova
// colide — rejeição "Duplicidade de NF-e"). Body: { proximoNumero: 5001 }.
// Produção não é alterada aqui de propósito (a virada de produção é decisão à parte).
router.post('/focus-nfe-homolog-numeracao', async (req, res) => {
    try {
        const proximoNumero = parseInt(req.body?.proximoNumero, 10);
        if (!proximoNumero) return res.status(400).json({ error: 'Informe { proximoNumero }.' });
        const tokenConta = process.env.FOCUS_NFE_TOKEN_CONTA;
        if (!tokenConta) return res.status(400).json({ error: 'FOCUS_NFE_TOKEN_CONTA não configurado.' });
        const auth = 'Basic ' + Buffer.from(`${tokenConta.trim()}:`).toString('base64');
        // Gestão de empresas é sempre na URL de produção (ver backend/docs/focus-nfe-api.md)
        const lista = await fetch('https://api.focusnfe.com.br/v2/empresas?cnpj=08766459000102', {
            headers: { Authorization: auth }, signal: AbortSignal.timeout(15000),
        }).then(r => r.json());
        const empresa = Array.isArray(lista) ? lista[0] : null;
        if (!empresa?.id) return res.status(404).json({ error: 'Empresa não encontrada na Focus.', lista });
        const r = await fetch(`https://api.focusnfe.com.br/v2/empresas/${empresa.id}`, {
            method: 'PUT',
            headers: { Authorization: auth, 'Content-Type': 'application/json' },
            body: JSON.stringify({ proximo_numero_nfe_homologacao: proximoNumero, serie_nfe_homologacao: 1 }),
            signal: AbortSignal.timeout(15000),
        });
        const data = await r.json().catch(() => ({}));
        res.json({
            httpStatus: r.status,
            empresaId: empresa.id,
            proximo_numero_nfe_homologacao: data.proximo_numero_nfe_homologacao,
            serie_nfe_homologacao: data.serie_nfe_homologacao,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/focus-nfe-emitir-pedido — emite a NF-e de um pedido REAL pelo fluxo
// oficial (focusNfeEmissaoService), para teste sem login de usuário. Body: { numero: 2268 }.
// Só roda em homologação (produção é pela tela, com permissão).
router.post('/focus-nfe-emitir-pedido', async (req, res) => {
    try {
        const focusNfeSvc = require('../services/focusNfeService');
        if (focusNfeSvc.ambiente() !== 'homologacao') {
            return res.status(400).json({ error: 'Rota de teste: só em FOCUS_NFE_AMBIENTE=homologacao.' });
        }
        const numero = parseInt(req.body?.numero, 10);
        if (!numero) return res.status(400).json({ error: 'Informe { numero } do pedido.' });
        const pedido = await prisma.pedido.findFirst({ where: { numero, especial: false, bonificacao: false } });
        if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });
        const emissao = require('../services/focusNfeEmissaoService');
        const nota = await emissao.emitirVenda(pedido.id);
        res.json({ ok: true, nota });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// GET /api/admin-exec/diag-nf-pedido?numero=2269 — raio-X: pedido + notas do app + eventos
// do webhook + (query ?sincronizar=1) reprocessa eventos pendentes na hora.
router.get('/diag-nf-pedido', async (req, res) => {
    try {
        const numero = parseInt(req.query.numero, 10);
        if (!numero) return res.status(400).json({ error: 'Informe ?numero=' });
        const emissao = require('../services/focusNfeEmissaoService');
        let sincronizados = null;
        if (req.query.sincronizar === '1') sincronizados = await emissao.sincronizarEventos();
        const pedido = await prisma.pedido.findFirst({
            where: { numero },
            select: {
                id: true, numero: true, situacaoCA: true, statusEnvio: true,
                nfeChave: true, nfeNumero: true, especial: true, bonificacao: true,
                notasFiscaisApp: true,
            },
        });
        if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });
        const refs = pedido.notasFiscaisApp.map(n => n.ref);
        const eventos = refs.length
            ? await prisma.focusNfeEvento.findMany({ where: { ref: { in: refs } }, orderBy: { id: 'asc' } })
            : [];
        res.json({ sincronizados, pedido, eventos });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/focus-nfe-producao-numeracao — configura a numeração de PRODUÇÃO na
// Focus para continuar a sequência do Conta Azul. Body: { proximoNumero: 84844 }.
// Rodar UMA vez na virada, depois de o dono confirmar o nº da última nota do CA.
router.post('/focus-nfe-producao-numeracao', async (req, res) => {
    try {
        const proximoNumero = parseInt(req.body?.proximoNumero, 10);
        if (!proximoNumero) return res.status(400).json({ error: 'Informe { proximoNumero }.' });
        const tokenConta = process.env.FOCUS_NFE_TOKEN_CONTA;
        if (!tokenConta) return res.status(400).json({ error: 'FOCUS_NFE_TOKEN_CONTA não configurado.' });
        const auth = 'Basic ' + Buffer.from(`${tokenConta.trim()}:`).toString('base64');
        const lista = await fetch('https://api.focusnfe.com.br/v2/empresas?cnpj=08766459000102', {
            headers: { Authorization: auth }, signal: AbortSignal.timeout(15000),
        }).then(r => r.json());
        const empresa = Array.isArray(lista) ? lista[0] : null;
        if (!empresa?.id) return res.status(404).json({ error: 'Empresa não encontrada na Focus.' });
        const r = await fetch(`https://api.focusnfe.com.br/v2/empresas/${empresa.id}`, {
            method: 'PUT',
            headers: { Authorization: auth, 'Content-Type': 'application/json' },
            body: JSON.stringify({ proximo_numero_nfe_producao: proximoNumero, serie_nfe_producao: 1 }),
            signal: AbortSignal.timeout(15000),
        });
        const data = await r.json().catch(() => ({}));
        res.json({
            httpStatus: r.status,
            proximo_numero_nfe_producao: data.proximo_numero_nfe_producao,
            serie_nfe_producao: data.serie_nfe_producao,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/nfe-backup-ca-xml — baixa TODOS os XMLs de NF-e do Conta Azul para
// o volume do app (uploads/xml-nfe), em segundo plano, antes do CA cortar o acesso de vez.
// Body opcional: { meses: 24 }. GET na mesma rota mostra o progresso.
router.post('/nfe-backup-ca-xml', async (req, res) => {
    try {
        const xmlNfeService = require('../services/xmlNfeService');
        const estado = await xmlNfeService.backupXmlsCA(parseInt(req.body?.meses, 10) || 24);
        res.json({ ok: true, estado });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
router.get('/nfe-backup-ca-xml', (req, res) => {
    const xmlNfeService = require('../services/xmlNfeService');
    res.json(xmlNfeService.backupStatus());
});

// POST /api/admin-exec/nfe-vincular-xmls — vincula os XMLs já baixados aos pedidos sem
// chave ("Referente ao pedido #N" no infCpl) — some o falso "Sem nota" dos antigos.
router.post('/nfe-vincular-xmls', async (req, res) => {
    try {
        const xmlNfeService = require('../services/xmlNfeService');
        res.json(await xmlNfeService.vincularXmlsBaixados());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/focus-nfe-sync-ie-clientes — para cada pedido do período sem nota
// cujo cliente PJ está SEM inscrição estadual no app, re-sincroniza o cliente do Conta Azul
// (o sync traz a IE p/ cliente_fiscal). Body opcional: { dias: 3 }.
router.post('/focus-nfe-sync-ie-clientes', async (req, res) => {
    try {
        const dias = parseInt(req.body?.dias, 10) || 3;
        const desde = new Date(Date.now() - dias * 24 * 3600 * 1000);
        const pedidos = await prisma.pedido.findMany({
            where: { especial: false, bonificacao: false, numero: { not: null }, dataVenda: { gte: desde } },
            include: { cliente: { include: { fiscal: true } } },
        });
        const semIE = [...new Map(
            pedidos
                .filter(p => {
                    const doc = String(p.cliente?.Documento || '').replace(/[^0-9A-Za-z]/g, '');
                    return doc && !/^\d{11}$/.test(doc) && !p.cliente?.fiscal?.inscricaoEstadual;
                })
                .map(p => [p.cliente.UUID, p.cliente])
        ).values()];
        const resultados = [];
        for (const c of semIE) {
            try {
                await contaAzulService.sincronizarClienteUnico(c.UUID);
                const fiscal = await prisma.clienteFiscal.findUnique({ where: { clienteUuid: c.UUID } });
                resultados.push({ cliente: c.Nome, ieAgora: fiscal?.inscricaoEstadual || null });
            } catch (e) {
                resultados.push({ cliente: c.Nome, erro: e.message });
            }
        }
        res.json({ clientesSemIE: semIE.length, resultados });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/diag-consulta-cnpj?cnpj=XXXXXXXXXXXXXX — testa a consulta combinada
// (Receita via BrasilAPI/CNPJá + IE via SEFAZ CadConsultaCadastro4 com o certificado A1).
router.get('/diag-consulta-cnpj', async (req, res) => {
    try {
        const consultaCnpjService = require('../services/consultaCnpjService');
        const resultado = await consultaCnpjService.consultarCnpj(String(req.query.cnpj || ''));
        res.json(resultado);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/clientes-preencher-ie-sefaz — consulta a IE na SEFAZ (certificado A1)
// para clientes PJ ATIVOS sem inscrição estadual e grava em cliente_fiscal.
// Só grava IE HABILITADA (IE baixada/não habilitada na nota causa rejeição — o certo é isento).
// Quem a SEFAZ diz não ser contribuinte fica marcado NAO_CONTRIBUINTE e sai das próximas rodadas.
// Body opcional: { limite: 30 }
router.post('/clientes-preencher-ie-sefaz', async (req, res) => {
    try {
        const consultaCnpjService = require('../services/consultaCnpjService');
        const limite = Math.min(parseInt(req.body?.limite, 10) || 30, 100);
        const clientes = await prisma.cliente.findMany({
            where: {
                Ativo: true,
                Tipo_Pessoa: 'JURIDICA',
                AND: [
                    { OR: [{ fiscal: null }, { fiscal: { inscricaoEstadual: null } }] },
                    { OR: [{ Indicador_Inscricao_Estadual: null }, { Indicador_Inscricao_Estadual: { notIn: ['NAO_CONTRIBUINTE', 'CONTRIBUINTE_ISENTO'] } }] }
                ]
            },
            select: { UUID: true, Nome: true, Documento: true, End_Estado: true },
            take: limite,
            orderBy: { Nome: 'asc' }
        });
        const resultados = [];
        for (const c of clientes) {
            const cnpj = String(c.Documento || '').replace(/[^0-9A-Za-z]/g, '');
            if (!/^\d{14}$/.test(cnpj)) { resultados.push({ cliente: c.Nome, pulado: 'documento não é CNPJ numérico' }); continue; }
            const r = await consultaCnpjService.consultarIeSefaz(cnpj, c.End_Estado || 'SC');
            if (r.ok && r.ie && r.situacaoIe === 'HABILITADO') {
                await prisma.clienteFiscal.upsert({
                    where: { clienteUuid: c.UUID },
                    create: { clienteUuid: c.UUID, inscricaoEstadual: r.ie },
                    update: { inscricaoEstadual: r.ie }
                });
                await prisma.cliente.update({ where: { UUID: c.UUID }, data: { Indicador_Inscricao_Estadual: 'CONTRIBUINTE' } })
                    .catch(() => {});
                resultados.push({ cliente: c.Nome, ie: r.ie, situacao: r.situacaoIe });
            } else if (r.ok) {
                // Sem IE utilizável (não contribuinte ou IE não habilitada) → nota sai como isento
                await prisma.cliente.update({ where: { UUID: c.UUID }, data: { Indicador_Inscricao_Estadual: 'NAO_CONTRIBUINTE' } })
                    .catch(() => {});
                resultados.push({ cliente: c.Nome, ie: null, motivo: r.ie ? `IE ${r.ie} não habilitada — deixado como não contribuinte` : (r.motivo || 'sem IE (não contribuinte)') });
            } else {
                resultados.push({ cliente: c.Nome, ie: null, motivo: r.motivo || 'consulta indisponível' });
            }
            await new Promise(rr => setTimeout(rr, 500)); // não martelar a SEFAZ
        }
        res.json({ candidatos: clientes.length, resultados });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/clientes-corrigir-ie-nao-habilitada — remove do cadastro as IEs
// informadas (gravadas por engano quando a SEFAZ devolveu situação NÃO habilitada) e marca
// os clientes como NAO_CONTRIBUINTE. Body: { ies: ["256319235", ...] }
router.post('/clientes-corrigir-ie-nao-habilitada', async (req, res) => {
    try {
        const ies = Array.isArray(req.body?.ies) ? req.body.ies.map(v => String(v).replace(/\D/g, '')).filter(Boolean) : [];
        if (!ies.length) return res.status(400).json({ error: 'Informe body.ies (lista de IEs a remover)' });
        const fiscais = await prisma.clienteFiscal.findMany({ where: { inscricaoEstadual: { in: ies } } });
        const resultados = [];
        for (const f of fiscais) {
            await prisma.clienteFiscal.update({ where: { clienteUuid: f.clienteUuid }, data: { inscricaoEstadual: null } });
            await prisma.cliente.update({ where: { UUID: f.clienteUuid }, data: { Indicador_Inscricao_Estadual: 'NAO_CONTRIBUINTE' } })
                .catch(() => {});
            resultados.push({ clienteUuid: f.clienteUuid, ieRemovida: f.inscricaoEstadual });
        }
        res.json({ corrigidos: resultados.length, resultados });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/focus-nfe-marcar-revenda — marca os produtos de REVENDA confirmados
// pelo dono (espetinho frango c/ bacon → CEST 1707900; bolinho de carne). CFOP 5102 na emissão.
router.post('/focus-nfe-marcar-revenda', async (req, res) => {
    try {
        const espetinho = await prisma.produto.updateMany({
            where: { nome: { contains: 'ESPETINHO', mode: 'insensitive' }, AND: { nome: { contains: 'BAC', mode: 'insensitive' } } },
            data: { nfeRevenda: true, nfeCest: '1707900' },
        });
        const bolinho = await prisma.produto.updateMany({
            where: { nome: { contains: 'BOLINHO DE CARNE', mode: 'insensitive' } },
            data: { nfeRevenda: true },
        });
        const marcados = await prisma.produto.findMany({ where: { nfeRevenda: true }, select: { nome: true, nfeCest: true } });
        res.json({ espetinho: espetinho.count, bolinho: bolinho.count, marcados });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/focus-nfe-consultar?ref=...&completa=1 — status de uma emissão na Focus.
router.get('/focus-nfe-consultar', async (req, res) => {
    try {
        const focusNfe = require('../services/focusNfeService');
        if (!req.query.ref) return res.status(400).json({ error: 'Informe ?ref=' });
        const r = await focusNfe.consultar(String(req.query.ref), req.query.completa === '1');
        res.json({ ambiente: focusNfe.ambiente(), ...r });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/focus-nfe-arquivo?ref=...&qual=danfe|xml|danfe-app — baixa a DANFE (PDF)
// ou o XML de uma nota emitida. `danfe-app` gera a DANFE com o NOSSO gerador (o mesmo layout
// que o app usa hoje para as notas do CA) a partir do XML da Focus.
router.get('/focus-nfe-arquivo', async (req, res) => {
    try {
        const focusNfe = require('../services/focusNfeService');
        if (!req.query.ref) return res.status(400).json({ error: 'Informe ?ref=' });
        const { data } = await focusNfe.consultar(String(req.query.ref));
        const qual = req.query.qual;
        const caminho = qual === 'danfe' ? data.caminho_danfe : data.caminho_xml_nota_fiscal;
        if (!caminho) return res.status(404).json({ error: 'Arquivo ainda não disponível.', statusNota: data.status, data });
        if (qual === 'danfe-app') {
            const xml = (await focusNfe.baixarArquivo(caminho)).toString('utf8');
            const { gerarPDF } = require('@alexssmusica/node-pdf-nfe');
            const path = require('path');
            const fs = require('fs');
            const pathLogo = path.join(__dirname, '../assets/logo-danfe.png');
            const doc = await gerarPDF(xml, fs.existsSync(pathLogo) ? { pathLogo } : {});
            res.setHeader('Content-Type', 'application/pdf');
            doc.pipe(res);
            return;
        }
        const buf = await focusNfe.baixarArquivo(caminho);
        res.setHeader('Content-Type', qual === 'xml' ? 'application/xml' : 'application/pdf');
        res.send(buf);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Integração de WhatsApp (bot da Ana) ───────────────────────────

// GET /api/admin-exec/bot-whatsapp-status — a chave do EasyPanel é aceita? como está a fila?
router.get('/bot-whatsapp-status', async (req, res) => {
    try {
        const botWhatsapp = require('../services/botWhatsappService');
        const [bot, fila] = await Promise.all([
            botWhatsapp.status(),
            prisma.botWhatsappEnvio.groupBy({ by: ['status'], _count: true }),
        ]);
        res.json({ bot, fila: Object.fromEntries(fila.map(f => [f.status, f._count])) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/bot-whatsapp-testar — manda uma mensagem de teste real.
// Body: { telefone, texto? }. Sempre tipo 'interno' (é teste da equipe, não cliente)
// e referência nova a cada chamada, para poder repetir sem cair na idempotência.
router.post('/bot-whatsapp-testar', async (req, res) => {
    try {
        const botWhatsapp = require('../services/botWhatsappService');
        const { telefone, texto } = req.body || {};
        if (!telefone) return res.status(400).json({ error: 'Informe o telefone.' });

        const r = await botWhatsapp.enviar({
            telefone,
            texto: texto || 'Teste da integração de WhatsApp do sistema Hardt. Se você recebeu isto, está tudo funcionando. ✅',
            tipo: 'interno',
            origem: 'teste-integracao',
            referencia: botWhatsapp.referenciaUnica(`teste-${String(telefone).replace(/\D/g, '')}`),
        });
        res.json(r);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Integração Asaas ──────────────────────────────────────────────

// GET /api/admin-exec/asaas-status — chave configurada? conta responde? webhook token setado?
router.get('/asaas-status', async (req, res) => {
    try {
        const asaasService = require('../services/asaasService');
        const status = await asaasService.statusIntegracao();
        // Diagnóstico seguro da chave (só prefixo + tamanho — detecta corte do "$" pelo EasyPanel)
        const k = process.env.ASAAS_API_KEY || '';
        res.json({
            ...status,
            webhookTokenConfigurado: !!process.env.ASAAS_WEBHOOK_TOKEN,
            chaveDiag: k ? `${k.slice(0, 6)}... (${k.length} caracteres)` : null
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/asaas-registrar-webhook — cria/atualiza o webhook no painel do Asaas
// Body opcional: { url } (padrão: URL pública do app + /api/asaas/webhook)
router.post('/asaas-registrar-webhook', async (req, res) => {
    try {
        const asaasService = require('../services/asaasService');
        // Atenção: o webhook precisa apontar para o domínio do BACKEND (o do frontend serve só o app)
        const url = req.body?.url || 'https://cahardt-hardt-backend.xrqvlq.easypanel.host/api/asaas/webhook';
        const resultado = await asaasService.registrarWebhook(url);
        res.json({ ok: true, url, ...resultado });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/asaas-configurar-conta-ca — acha a conta financeira "ASAAS" no
// Conta Azul e grava o id em app_configs.asaas_conta_financeira_ca_id (baixas do PIX caem nela)
router.post('/asaas-configurar-conta-ca', async (req, res) => {
    try {
        const contas = await contaAzulService.listarContasFinanceiras();
        const alvo = req.body?.nome || 'asaas';
        const conta = contas.find(c => (c.nome || '').toLowerCase().includes(String(alvo).toLowerCase()));
        if (!conta) {
            return res.status(404).json({ ok: false, error: `Nenhuma conta financeira com "${alvo}" no nome.`, contas: contas.map(c => c.nome) });
        }
        await prisma.appConfig.upsert({
            where: { key: 'asaas_conta_financeira_ca_id' },
            create: { key: 'asaas_conta_financeira_ca_id', value: conta.id },
            update: { value: conta.id }
        });
        res.json({ ok: true, contaEscolhida: conta });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/asaas-extrato-sync — dispara a busca do extrato do Asaas para a
// conciliação bancária (o worker roda sozinho a cada 30 min; isto é para diagnóstico/backfill).
// Body opcional: { dias } (padrão 7, máx 90 — usar 90 na primeira carga).
router.post('/asaas-extrato-sync', async (req, res) => {
    try {
        const asaasExtratoService = require('../services/asaasExtratoService');
        const r = await asaasExtratoService.sincronizar({ dias: Number(req.body?.dias) || 7 });
        res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/asaas-corrigir-baixa-entrega — conserta o caso "PIX de entrega
// recebido no Asaas mas parcela aberta" (Caixa só trocou a forma no CA, sem baixar).
// Body: { paymentId } (ex.: pay_3x25fglydot6ist0). Vincula a cobrança à parcela aberta
// de valor compatível e roda a baixa padrão (app: ledger na conta Asaas; CA: baixa na
// conta Asaas, PIX). Idempotente — reprocessar não duplica (flags baixaAppOk/baixaCaOk).
router.post('/asaas-corrigir-baixa-entrega', async (req, res) => {
    try {
        const paymentId = String(req.body?.paymentId || '').trim();
        if (!paymentId) return res.status(400).json({ error: 'Informe paymentId.' });

        const cobranca = await prisma.cobrancaAsaas.findUnique({ where: { asaasPaymentId: paymentId } });
        if (!cobranca) return res.status(404).json({ error: 'Cobrança não encontrada no app.' });
        if (cobranca.status !== 'RECEBIDO') return res.status(400).json({ error: `Cobrança está ${cobranca.status} — só corrijo cobrança RECEBIDA.` });
        if (!cobranca.pedidoId) return res.status(400).json({ error: 'Cobrança sem pedido vinculado.' });

        // Vincula a parcela aberta de valor compatível (se ainda não vinculada)
        if (!cobranca.parcelaId) {
            const conta = await prisma.contaReceber.findFirst({
                where: { pedidoId: cobranca.pedidoId },
                include: { parcelas: { orderBy: { numeroParcela: 'asc' } } }
            });
            if (!conta) return res.status(400).json({ error: 'Pedido sem conta a receber no app.' });
            const valorCob = Number(cobranca.valorRecebido ?? cobranca.valor);
            const abertas = conta.parcelas.filter(p => ['PENDENTE', 'VENCIDO', 'PARCIAL'].includes(p.status));
            const alvo = abertas.find(p => Math.abs(Number(p.valor) - Number(p.valorPago || 0) - valorCob) <= 0.01) || (abertas.length === 1 ? abertas[0] : null);
            if (!alvo) return res.status(400).json({ error: 'Nenhuma parcela aberta com valor compatível (ambíguo — corrigir à mão).', parcelas: conta.parcelas.map(p => ({ n: p.numeroParcela, valor: p.valor, status: p.status })) });
            await prisma.cobrancaAsaas.update({ where: { id: cobranca.id }, data: { parcelaId: alvo.id } });
        }

        const asaasBaixaService = require('../services/asaasBaixaService');
        const r = await asaasBaixaService.registrarBaixa(cobranca.id);
        res.json({ ok: r.erros.length === 0, ...r });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/asaas-reprocessar-baixas — cobranças RECEBIDAS com baixa pendente (app ou CA)
router.post('/asaas-reprocessar-baixas', async (req, res) => {
    try {
        const asaasBaixaService = require('../services/asaasBaixaService');
        const resultados = await asaasBaixaService.reprocessarPendentes();
        res.json({ ok: true, total: resultados.length, resultados });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/backfill-contas-receber — cria a conta a receber de pedidos
// enviados que ficaram sem (bug do fluxo ABERTO→ENVIAR, ex.: pedidos do Site Congelados).
// Faturados no CA: parcelas espelham as do CA (vencimento/valor oficiais).
// Especiais sem venda no CA: 1 parcela com o total, vencendo na data da venda.
// Body opcional: { numeros: [2035, ...] } para limitar; { dryRun: true } só lista.
router.post('/backfill-contas-receber', async (req, res) => {
    try {
        const numeros = (req.body?.numeros || []).map(n => parseInt(n, 10)).filter(Boolean);
        const dryRun = !!req.body?.dryRun;
        const pedidos = await prisma.pedido.findMany({
            where: {
                bonificacao: false,
                statusEnvio: { in: ['ENVIAR', 'RECEBIDO', 'SINCRONIZANDO'] },
                contaReceber: null,
                ...(numeros.length ? { numero: { in: numeros } } : {})
            },
            include: {
                cliente: { select: { UUID: true } },
                itens: { select: { valor: true, quantidade: true } }
            }
        });

        const resultados = [];
        for (const p of pedidos) {
            const item = { numero: p.numero, especial: p.especial, pedidoId: p.id };
            try {
                const totalItens = Math.round(p.itens.reduce((s, i) => s + Number(i.valor) * Number(i.quantidade), 0) * 100) / 100;
                let parcelasData = null;

                if (p.idVendaContaAzul && p.cliente?.UUID) {
                    // Fonte oficial: parcelas da venda no CA — espelha vencimento, valor E status
                    // (parcela já RECEBIDA no CA entra como PAGO aqui; senão criaria inadimplência falsa)
                    const dataVendaStr = new Date(p.dataVenda).toISOString().split('T')[0];
                    const parcelasCA = await contaAzulService.encontrarParcelasDeVenda(p.cliente.UUID, p.idVendaContaAzul, dataVendaStr);
                    if (parcelasCA?.length) {
                        parcelasData = parcelasCA
                            .sort((a, b) => new Date(a.data_vencimento) - new Date(b.data_vencimento))
                            .map((pc, i) => {
                                const valor = Math.round(Number(pc.valor_composicao?.valor_bruto ?? pc.valor ?? 0) * 100) / 100;
                                const pagaNoCA = pc.status === 'RECEBIDO';
                                return {
                                    numeroParcela: i + 1,
                                    valor,
                                    dataVencimento: new Date(pc.data_vencimento),
                                    ...(pagaNoCA ? {
                                        status: 'PAGO',
                                        valorPago: valor,
                                        dataPagamento: pc.data_quitacao ? new Date(pc.data_quitacao) : new Date(pc.data_vencimento),
                                        observacao: 'Baixa espelhada do Conta Azul (backfill de conta a receber).'
                                    } : {})
                                };
                            });
                    }
                }
                if (!parcelasData) {
                    // Sem venda no CA (ex.: especial): 1 parcela com o total do pedido
                    parcelasData = [{ numeroParcela: 1, valor: totalItens, dataVencimento: new Date(p.dataVenda) }];
                }

                const valorTotal = Math.round(parcelasData.reduce((s, x) => s + x.valor, 0) * 100) / 100;
                const pagas = parcelasData.filter(x => x.status === 'PAGO').length;
                const statusConta = pagas === parcelasData.length ? 'QUITADO' : (pagas > 0 ? 'PARCIAL' : 'ABERTO');
                item.parcelas = parcelasData.map(x => ({ valor: x.valor, venc: x.dataVencimento.toISOString().split('T')[0], status: x.status || 'PENDENTE' }));
                item.valorTotal = valorTotal;
                item.statusConta = statusConta;

                if (!dryRun) {
                    await prisma.contaReceber.create({
                        data: {
                            pedidoId: p.id,
                            clienteId: p.clienteId,
                            origem: p.especial ? 'ESPECIAL' : 'FATURADO_CA',
                            valorTotal,
                            status: statusConta,
                            parcelas: { create: parcelasData }
                        }
                    });
                    item.criada = true;
                }
            } catch (e) {
                item.erro = e.message;
            }
            resultados.push(item);
        }
        res.json({ ok: true, dryRun, total: resultados.length, resultados });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/diag-nota-fiscal?idVenda=... — resposta crua da API de notas fiscais do CA
// (investigação: a API devolve link de DANFE PDF/XML?)
router.get('/diag-nota-fiscal', async (req, res) => {
    try {
        // `qs` cru para experimentar formatos (ex.: ?qs=pagina=1%26tamanho_pagina=5).
        // `path` opcional para variar o recurso (ex.: notas-fiscais/{id}/pdf).
        const path = req.query.path || 'notas-fiscais';
        let qs = req.query.qs;
        if (!qs) {
            const hoje = new Date();
            const antes = new Date(hoje.getTime() - 30 * 24 * 3600 * 1000);
            qs = `pagina=1&tamanho_pagina=5&data_inicial=${antes.toISOString().split('T')[0]}&data_final=${hoje.toISOString().split('T')[0]}`;
        }
        const url = `https://api-v2.contaazul.com/v1/${path}${qs ? `?${qs}` : ''}`;
        const response = await contaAzulService._axiosGet(url, 'NOTA_FISCAL_DIAG');
        res.json({ url, data: response.data });
    } catch (e) {
        res.status(500).json({ error: e.message, detalhe: e.response?.data || null, status: e.response?.status || null });
    }
});

// GET /api/admin-exec/diag-danfe?numero=2028 — testa o fluxo completo da DANFE de um pedido
router.get('/diag-danfe', async (req, res) => {
    try {
        const numero = parseInt(req.query.numero, 10);
        if (!numero) return res.status(400).json({ error: 'Informe ?numero=' });
        const pedido = await prisma.pedido.findFirst({ where: { numero, especial: false, bonificacao: false } });
        if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });
        const pedidoController = require('../controllers/pedidoController');
        const nota = await pedidoController._localizarNotaFiscal(pedido);
        const xml = await contaAzulService.buscarXmlNotaFiscal(nota.chave_acesso);
        const { gerarPDF } = require('@alexssmusica/node-pdf-nfe');
        const path = require('path');
        const fs = require('fs');
        const pathLogo = path.join(__dirname, '../assets/logo-danfe.png');
        const doc = await gerarPDF(xml, fs.existsSync(pathLogo) ? { pathLogo } : {});
        // ?pdf=1 → devolve o PDF em si (conferência visual); senão devolve o resumo JSON
        if (req.query.pdf === '1') {
            res.setHeader('Content-Type', 'application/pdf');
            doc.pipe(res);
            return;
        }
        const chunks = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => res.json({
            ok: true,
            numeroNota: nota.numero_nota,
            chave: nota.chave_acesso,
            cache: !!nota.cache,
            xmlBytes: xml.length,
            pdfBytes: Buffer.concat(chunks).length
        }));
    } catch (e) {
        res.status(e.statusCode || 500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/danfe-limpar-cache — apaga as DANFEs do cache em disco para
// serem regeradas com o layout atual na próxima impressão (a NF-e em si não muda).
// Body opcional: { chave: '4226...' } limpa só uma; sem body limpa todas.
router.post('/danfe-limpar-cache', async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const dir = path.join(__dirname, '../uploads/cache-fiscal');
        if (!fs.existsSync(dir)) return res.json({ ok: true, removidos: [] });
        const chave = (req.body?.chave || '').replace(/\D/g, '');
        const alvos = fs.readdirSync(dir).filter(n =>
            chave ? n === `danfe-${chave}.pdf` : /^danfe-.*\.pdf$/.test(n));
        for (const n of alvos) fs.unlinkSync(path.join(dir, n));
        res.json({ ok: true, removidos: alvos });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/asaas-verificar-vencidos-ca — para cada boleto Asaas VENCIDO
// e ainda PENDENTE, confere a parcela correspondente no Conta Azul. Se estiver
// quitada lá e body { aplicar: true }, roda o sync da conta (aplica a baixa local
// e cancela o boleto no Asaas na sequência). Sequencial — não martela o CA.
router.post('/asaas-verificar-vencidos-ca', async (req, res) => {
    try {
        const aplicar = !!req.body?.aplicar;
        const hoje = new Date();
        const cobs = await prisma.cobrancaAsaas.findMany({
            where: { tipo: 'BOLETO', status: 'PENDENTE', vencimento: { lt: hoje }, parcelaId: { not: null } },
            include: {
                parcela: { select: { id: true, numeroParcela: true, status: true, contaReceberId: true } },
                pedido: { select: { numero: true, idVendaContaAzul: true, dataVenda: true } },
                cliente: { select: { UUID: true, Nome: true } }
            },
            orderBy: { vencimento: 'asc' }
        });
        const PAGO_CA = ['RECEBIDO', 'RECEBIDO_PARCIAL', 'QUITADO', 'QUITADO_PARCIAL', 'ACQUITTED', 'PAID'];
        const contasReceberSyncService = require('../services/contasReceberSyncService');
        const resultados = [];
        for (const cob of cobs) {
            const item = {
                pedido: cob.pedido?.numero || null,
                cliente: cob.cliente?.Nome || null,
                parcela: cob.parcela?.numeroParcela,
                valor: Number(cob.valor),
                vencimento: cob.vencimento?.toISOString?.().split('T')[0],
                statusLocal: cob.parcela?.status
            };
            try {
                if (!cob.pedido?.idVendaContaAzul) {
                    item.statusCA = 'SEM_VENDA_CA';
                } else {
                    const dataVendaStr = new Date(cob.pedido.dataVenda).toISOString().split('T')[0];
                    const parcelasCA = await contaAzulService.encontrarParcelasDeVenda(cob.cliente.UUID, cob.pedido.idVendaContaAzul, dataVendaStr);
                    const caPar = (parcelasCA || []).find(p => (p.numero_parcela || 1) === (cob.parcela?.numeroParcela || 1)) || (parcelasCA || [])[0];
                    item.statusCA = caPar?.status || 'NAO_ENCONTRADA';
                    item.quitadaNoCA = PAGO_CA.includes(caPar?.status);
                    if (item.quitadaNoCA && aplicar && cob.parcela?.contaReceberId) {
                        const r = await contasReceberSyncService.sincronizarConta(cob.parcela.contaReceberId);
                        item.baixasAplicadas = r.aplicadas;
                        const depois = await prisma.cobrancaAsaas.findUnique({ where: { id: cob.id }, select: { status: true } });
                        item.boletoAgora = depois?.status;
                    }
                }
            } catch (e) {
                item.erro = e.message;
            }
            resultados.push(item);
        }
        const quitadasCA = resultados.filter(r => r.quitadaNoCA).length;
        res.json({ ok: true, aplicar, total: resultados.length, quitadasNoCA: quitadasCA, resultados });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/asaas-quitar-residuo-ca — acha parcelas no CA que ficaram com
// resíduo de CENTAVOS "Em Aberto" após a baixa automática do Asaas (boleto de 341,20
// contra parcela de 341,21 — arredondamento diferente na divisão das parcelas) e,
// com body { aplicar: true }, quita o resíduo lá com uma baixa de desconto.
// Sem aplicar = só lista (dry-run). Sequencial com pausa — não martela o CA.
router.post('/asaas-quitar-residuo-ca', async (req, res) => {
    try {
        const aplicar = !!req.body?.aplicar;
        const dias = Number(req.body?.dias) || 90;
        const desde = new Date(); desde.setDate(desde.getDate() - dias);
        const cobs = await prisma.cobrancaAsaas.findMany({
            where: {
                status: 'RECEBIDO',
                baixaCaOk: true,
                parcelaId: { not: null },
                recebidoEm: { gte: desde },
                ...(req.body?.pedido ? { pedido: { numero: Number(req.body.pedido) } } : {})
            },
            include: {
                parcela: { select: { numeroParcela: true, dataVencimento: true } },
                pedido: { select: { numero: true, idVendaContaAzul: true, dataVenda: true } },
                cliente: { select: { UUID: true, Nome: true } }
            },
            orderBy: { recebidoEm: 'desc' },
            take: 60
        });
        const cfg = await prisma.appConfig.findUnique({ where: { key: 'asaas_conta_financeira_ca_id' } });
        const contaCaId = cfg?.value || null;
        const resultados = [];
        for (const cob of cobs) {
            if (!cob.pedido?.idVendaContaAzul || !cob.cliente?.UUID) continue;
            if (resultados.length > 0) await new Promise(r => setTimeout(r, 2000));
            const item = {
                pedido: cob.pedido.numero,
                cliente: cob.cliente.Nome,
                parcela: cob.parcela?.numeroParcela,
                valorBoleto: Number(cob.valorRecebido ?? cob.valor),
                paymentId: cob.asaasPaymentId
            };
            try {
                const dataVendaStr = new Date(cob.pedido.dataVenda).toISOString().split('T')[0];
                const parcelasCA = await contaAzulService.encontrarParcelasDeVenda(
                    cob.cliente.UUID, cob.pedido.idVendaContaAzul, dataVendaStr
                );
                const vencLocal = cob.parcela?.dataVencimento ? new Date(cob.parcela.dataVencimento).toISOString().split('T')[0] : null;
                const caPar = (parcelasCA || []).find(p => (p.numero_parcela || 0) === cob.parcela?.numeroParcela)
                    || (parcelasCA || []).find(p => p.data_vencimento === vencLocal)
                    || ((parcelasCA || []).length === 1 ? parcelasCA[0] : null);
                if (!caPar) { item.resultado = 'PARCELA_CA_NAO_ENCONTRADA'; resultados.push(item); continue; }

                const nominalCA = Number(caPar?.valor_composicao?.valor_bruto || 0);
                const pagoCA = Number(caPar?.valor_pago || 0);
                const residuo = Math.round((nominalCA - pagoCA) * 100) / 100;
                item.nominalCA = nominalCA; item.pagoCA = pagoCA; item.residuo = residuo;

                if (!(pagoCA > 0 && residuo > 0 && residuo <= 0.05)) {
                    item.resultado = residuo <= 0 ? 'OK_QUITADA' : 'RESIDUO_GRANDE_NAO_MEXER';
                    resultados.push(item); continue;
                }
                if (!aplicar) { item.resultado = 'RESIDUO_ENCONTRADO (dry-run)'; resultados.push(item); continue; }
                if (!contaCaId) throw new Error('asaas_conta_financeira_ca_id não configurada');

                await contaAzulService.criarBaixa(caPar.id, {
                    data_pagamento: new Date(cob.recebidoEm || Date.now()).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }),
                    composicao_valor: { valor_bruto: residuo, multa: 0, juros: 0, desconto: residuo, taxa: 0 },
                    conta_financeira: contaCaId,
                    metodo_pagamento: cob.tipo === 'BOLETO' ? 'BOLETO_BANCARIO' : 'PIX_PAGAMENTO_INSTANTANEO',
                    observacao: `Resíduo de arredondamento quitado como desconto (${cob.asaasPaymentId})`
                });
                item.resultado = 'RESIDUO_QUITADO';
            } catch (e) {
                item.erro = e.response?.data ? JSON.stringify(e.response.data) : e.message;
            }
            resultados.push(item);
        }
        const comResiduo = resultados.filter(r => (r.resultado || '').startsWith('RESIDUO')).length;
        res.json({ ok: true, aplicar, analisadas: resultados.length, comResiduo, resultados });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/asaas-cancelar-boletos-quitados — cancela no Asaas os boletos
// PENDENTES cuja parcela já está PAGA/CANCELADA no app (cliente pagou por outro meio,
// ex.: boleto antigo do CA). Body: { dryRun: true } só lista, sem cancelar.
router.post('/asaas-cancelar-boletos-quitados', async (req, res) => {
    try {
        const dryRun = !!req.body?.dryRun;
        const orfas = await prisma.cobrancaAsaas.findMany({
            where: {
                status: { in: ['PENDENTE', 'EXPIRADO'] }, // EXPIRADO = boleto vencido, ainda pagável no Asaas
                parcelaId: { not: null },
                parcela: { status: { in: ['PAGO', 'CANCELADO'] } }
            },
            include: {
                parcela: { select: { status: true, numeroParcela: true, valorPago: true } },
                pedido: { select: { numero: true } },
                cliente: { select: { Nome: true } }
            }
        });
        const asaasService = require('../services/asaasService');
        const resultados = [];
        for (const cob of orfas) {
            const item = {
                pedido: cob.pedido?.numero || null,
                cliente: cob.cliente?.Nome || null,
                tipo: cob.tipo,
                valor: Number(cob.valor),
                parcela: cob.parcela?.numeroParcela,
                statusParcela: cob.parcela?.status,
                paymentId: cob.asaasPaymentId
            };
            if (!dryRun) {
                const r = await asaasService.cancelarCobrancasDaParcela(cob.parcelaId, 'faxina: parcela já quitada no app/CA');
                item.cancelada = r.canceladas > 0;
                if (r.erros?.length) item.erro = r.erros.map(x => x.erro).join('; ');
            }
            resultados.push(item);
        }
        res.json({ ok: true, dryRun, total: resultados.length, resultados });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/diag-parcela-venda?numero=2034 — parcela CA de uma VENDA (contas a receber):
// mostra todos os campos do detalhe (nome do campo da conta financeira, versao, vencimento)
// + dados locais do pedido/parcelas para comparar vencimentos.
router.get('/diag-parcela-venda', async (req, res) => {
    try {
        const numero = parseInt(req.query.numero, 10);
        if (!numero) return res.status(400).json({ error: 'Informe ?numero=' });
        const pedido = await prisma.pedido.findFirst({
            where: { numero, especial: false, bonificacao: false },
            include: {
                cliente: { select: { UUID: true, Nome: true } },
                contaReceber: { include: { parcelas: { orderBy: { numeroParcela: 'asc' } } } }
            }
        });
        if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });

        const dataVendaStr = new Date(pedido.dataVenda).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        let parcelasCA = [];
        let detalhe = null;
        if (pedido.idVendaContaAzul) {
            parcelasCA = await contaAzulService.encontrarParcelasDeVenda(pedido.cliente.UUID, pedido.idVendaContaAzul, dataVendaStr);
            if (parcelasCA[0]?.id) {
                try { detalhe = await contaAzulService.buscarParcelaDetalhe(parcelasCA[0].id); } catch (e) { detalhe = { erro: e.message }; }
            }
        }
        res.json({
            pedidoLocal: {
                numero: pedido.numero,
                dataVenda: pedido.dataVenda,
                nomeCondicaoPagamento: pedido.nomeCondicaoPagamento,
                tipoPagamento: pedido.tipoPagamento,
                primeiroVencimento: pedido.primeiroVencimento,
                intervaloDias: pedido.intervaloDias,
                idContaFinanceira: pedido.idContaFinanceira,
                situacaoCA: pedido.situacaoCA
            },
            parcelasLocais: (pedido.contaReceber?.parcelas || []).map(p => ({ n: p.numeroParcela, venc: p.dataVencimento, status: p.status, valor: p.valor })),
            parcelasCA: parcelasCA.map(p => ({ id: p.id, n: p.numero_parcela, venc: p.data_vencimento, status: p.status })),
            detalheParcelaCA: detalhe
        });
    } catch (e) {
        res.status(500).json({ error: e.message, detalhe: e.response?.data || null });
    }
});

// POST /api/admin-exec/asaas-reprocessar-estorno — força o tratamento de estorno de
// uma cobrança (webhook antigo/perdido). Body: { paymentId } ou { cobrancaId }.
// registrarEstorno é idempotente: se não há baixa, só normaliza o status + gera o aviso.
router.post('/asaas-reprocessar-estorno', async (req, res) => {
    try {
        const { paymentId, cobrancaId } = req.body || {};
        const cobranca = cobrancaId
            ? await prisma.cobrancaAsaas.findUnique({ where: { id: cobrancaId } })
            : await prisma.cobrancaAsaas.findUnique({ where: { asaasPaymentId: paymentId } });
        if (!cobranca) return res.status(404).json({ error: 'Cobrança não encontrada.' });
        const asaasBaixaService = require('../services/asaasBaixaService');
        const resultado = await asaasBaixaService.registrarEstorno(cobranca.id);
        const depois = await prisma.cobrancaAsaas.findUnique({ where: { id: cobranca.id } });
        res.json({ ok: true, statusAntes: cobranca.status, statusDepois: depois.status, resultado });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/diag-cobrancas-ca?limite=8 — varre pedidos de BOLETO faturados e
// mostra as solicitações de cobrança do CA (url/tipo/status) + o content-type da URL
// (para saber se o boleto do CA é PDF mergeável na impressão em lote).
router.get('/diag-cobrancas-ca', async (req, res) => {
    try {
        const axios = require('axios');
        const limite = Math.min(parseInt(req.query.limite, 10) || 8, 20);
        const pedidos = await prisma.pedido.findMany({
            where: {
                especial: false, bonificacao: false,
                tipoPagamento: 'BOLETO_BANCARIO',
                idVendaContaAzul: { not: null },
                situacaoCA: 'FATURADO'
            },
            orderBy: { createdAt: 'desc' },
            take: limite,
            include: { cliente: { select: { UUID: true, Nome: true } } }
        });

        const saida = [];
        for (const p of pedidos) {
            const dataVendaStr = new Date(p.dataVenda).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
            try {
                const parcelas = await contaAzulService.encontrarParcelasDeVenda(p.cliente.UUID, p.idVendaContaAzul, dataVendaStr);
                const cobs = [];
                for (const par of (parcelas || [])) {
                    for (const c of (par.solicitacoes_cobrancas || [])) {
                        let contentType = null, bytes = null;
                        if (c.url && req.query.testarUrl === '1') {
                            try {
                                const r = await axios.get(c.url, { responseType: 'arraybuffer', timeout: 20000, maxRedirects: 5 });
                                contentType = r.headers['content-type'];
                                bytes = r.data?.length || null;
                            } catch (e) { contentType = `ERRO: ${e.message}`; }
                        }
                        cobs.push({
                            parcela: par.numero_parcela, statusParcela: par.status,
                            tipo: c.tipo_solicitacao_cobranca || c.tipo || null,
                            status: c.status || null,
                            url: c.url || null,
                            _chaves: Object.keys(c || {}),
                            contentType, bytes
                        });
                    }
                }
                saida.push({ numero: p.numero, parcelasCA: (parcelas || []).length, cobrancas: cobs });
            } catch (e) {
                saida.push({ numero: p.numero, erro: e.message });
            }
        }
        res.json({ total: saida.length, pedidos: saida });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/diag-checar-lote — roda a MESMA checagem da impressão em lote
// (consulta o CA e classifica os boletos). Body: { numeros: [2027, 2025] }
router.post('/diag-checar-lote', async (req, res) => {
    try {
        const numeros = (req.body?.numeros || []).map(n => parseInt(n, 10)).filter(Boolean);
        if (!numeros.length) return res.status(400).json({ error: 'Informe numeros: [..]' });
        const pedidos = await prisma.pedido.findMany({
            where: { numero: { in: numeros }, especial: false, bonificacao: false },
            select: { id: true, numero: true }
        });
        const impressaoLoteService = require('../services/impressaoLoteService');
        const itens = await impressaoLoteService.checar(pedidos.map(p => p.id));
        res.json({ itens });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/diag-parcela-patch — testa PATCH numa parcela CA (ex.: trocar conta financeira)
// Body: { parcelaId, payload } — versao atual é buscada automaticamente
router.post('/diag-parcela-patch', async (req, res) => {
    try {
        const { parcelaId, payload } = req.body || {};
        if (!parcelaId || !payload) return res.status(400).json({ error: 'Informe parcelaId e payload.' });
        const antes = await contaAzulService.buscarParcelaDetalhe(parcelaId);
        const patch = { versao: antes.versao, ...payload };
        await contaAzulService.atualizarParcela(parcelaId, patch);
        const depois = await contaAzulService.buscarParcelaDetalhe(parcelaId);
        res.json({
            ok: true,
            patchEnviado: patch,
            contaAntes: antes.conta_financeira?.nome || null,
            contaDepois: depois.conta_financeira?.nome || null,
            metodoDepois: depois.metodo_pagamento,
            vencimentoDepois: depois.data_vencimento
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message, detalhe: e.response?.data || null });
    }
});

// GET /api/admin-exec/asaas-cobrancas — últimas cobranças (diagnóstico)
router.get('/asaas-cobrancas', async (req, res) => {
    try {
        // ?pedidoNumero=2041 filtra por pedido; nesse caso devolve também a conta/parcelas
        const numero = parseInt(req.query.pedidoNumero, 10) || null;
        const cobrancas = await prisma.cobrancaAsaas.findMany({
            where: numero ? { pedido: { numero, especial: false, bonificacao: false } } : {},
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: { cliente: { select: { Nome: true } }, pedido: { select: { numero: true } } }
        });
        let conta = null;
        if (numero) {
            conta = await prisma.contaReceber.findFirst({
                where: { pedido: { numero, especial: false, bonificacao: false } },
                include: { parcelas: true, pedido: { select: { numero: true, baixaCaRealizada: true, situacaoCA: true } } }
            });
        }
        const eventos = numero ? [] : await prisma.asaasWebhookEvento.findMany({ orderBy: { createdAt: 'desc' }, take: 10 });
        res.json({ cobrancas, conta, eventos });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/diag-asaas-cliente?nome=CLARA — compara as cobranças de um
// cliente no ASAAS com as registradas no app. Aponta órfãs (existem só no Asaas —
// ex.: 2ª via emitida em duplicidade) e o estado das parcelas locais.
router.get('/diag-asaas-cliente', async (req, res) => {
    try {
        const nome = (req.query.nome || '').trim();
        if (!nome) return res.status(400).json({ error: 'Informe ?nome=' });
        const asaasService = require('../services/asaasService');
        const axios = require('axios');
        let key = process.env.ASAAS_API_KEY || '';
        if (key.startsWith('aact_')) key = '$' + key;
        const asaasHttp = axios.create({
            baseURL: key.includes('hmlg') ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3',
            timeout: 20000,
            headers: { access_token: key, 'User-Agent': 'CA-Hardt-App' }
        });

        const clientes = await prisma.cliente.findMany({
            where: { OR: [{ Nome: { contains: nome, mode: 'insensitive' } }, { NomeFantasia: { contains: nome, mode: 'insensitive' } }] },
            select: { UUID: true, Nome: true },
            take: 3
        });
        const saida = [];
        for (const cli of clientes) {
            const item = { cliente: cli.Nome, clienteUuid: cli.UUID };
            const locais = await prisma.cobrancaAsaas.findMany({
                where: { clienteId: cli.UUID },
                orderBy: { createdAt: 'desc' },
                take: 30,
                include: {
                    pedido: { select: { numero: true } },
                    parcela: { select: { numeroParcela: true, status: true, valor: true, valorPago: true, dataVencimento: true } }
                }
            });
            item.cobrancasApp = locais.map(c => ({
                paymentId: c.asaasPaymentId, tipo: c.tipo, status: c.status,
                valor: Number(c.valor), vencimento: c.vencimento?.toISOString?.().split('T')[0] || null,
                criadaEm: c.createdAt, pedido: c.pedido?.numero || null,
                parcelaId: c.parcelaId,
                parcela: c.parcela ? { n: c.parcela.numeroParcela, status: c.parcela.status, valor: Number(c.parcela.valor), pago: Number(c.parcela.valorPago || 0), venc: c.parcela.dataVencimento?.toISOString?.().split('T')[0] } : null
            }));
            const vinculo = await prisma.clienteAsaas.findUnique({ where: { clienteUuid: cli.UUID } });
            item.asaasCustomerId = vinculo?.asaasCustomerId || null;
            if (vinculo?.asaasCustomerId && key) {
                try {
                    const r = await asaasHttp.get('/payments', { params: { customer: vinculo.asaasCustomerId, limit: 50 } });
                    const idsLocais = new Set(locais.map(c => c.asaasPaymentId));
                    item.cobrancasAsaas = (r.data?.data || []).map(p => ({
                        paymentId: p.id, status: p.status, tipo: p.billingType,
                        valor: p.value, vencimento: p.dueDate, criadaEm: p.dateCreated,
                        descricao: (p.description || '').slice(0, 60),
                        deletado: !!p.deleted,
                        externalReference: p.externalReference || null,
                        noApp: idsLocais.has(p.id) // false = ÓRFÃ (só no Asaas)
                    }));
                    item.orfas = item.cobrancasAsaas.filter(p => !p.noApp && !p.deleted).length;
                } catch (e) {
                    item.erroAsaas = e.response?.data?.errors?.[0]?.description || e.message;
                }
            }
            saida.push(item);
        }
        res.json({ ambiente: asaasService.AMBIENTE, clientes: saida });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/asaas-cancelar-payment?paymentId=pay_xxx — cancela UMA cobrança
// direto no Asaas (mesmo órfã, sem registro local). Recusa se já paga. ?confirmar=1 aplica.
router.post('/asaas-cancelar-payment', async (req, res) => {
    try {
        const paymentId = (req.query.paymentId || '').trim();
        if (!paymentId.startsWith('pay_')) return res.status(400).json({ error: 'Informe ?paymentId=pay_...' });
        const axios = require('axios');
        let key = process.env.ASAAS_API_KEY || '';
        if (key.startsWith('aact_')) key = '$' + key;
        if (!key) return res.status(503).json({ error: 'ASAAS_API_KEY não configurada.' });
        const asaasHttp = axios.create({
            baseURL: key.includes('hmlg') ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3',
            timeout: 20000,
            headers: { access_token: key, 'User-Agent': 'CA-Hardt-App' }
        });
        const { data: p } = await asaasHttp.get(`/payments/${paymentId}`);
        const resumo = { paymentId: p.id, status: p.status, valor: p.value, vencimento: p.dueDate, descricao: p.description, deletado: !!p.deleted };
        if (['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(p.status)) {
            return res.status(400).json({ error: 'Cobrança já foi PAGA — não cancelo.', cobranca: resumo });
        }
        if (p.deleted) return res.json({ ok: true, jaEstavaCancelada: true, cobranca: resumo });
        if (req.query.confirmar !== '1') {
            return res.json({ ok: true, dryRun: true, aviso: 'Adicione ?confirmar=1 para cancelar de verdade.', cobranca: resumo });
        }
        await asaasHttp.delete(`/payments/${paymentId}`);
        await prisma.cobrancaAsaas.updateMany({ where: { asaasPaymentId: paymentId }, data: { status: 'CANCELADO' } });
        res.json({ ok: true, cancelada: true, cobranca: resumo });
    } catch (e) {
        res.status(e.response?.status === 404 ? 404 : 500).json({ error: e.response?.data?.errors?.[0]?.description || e.message });
    }
});

// POST /api/admin-exec/asaas-sincronizar-vencimentos?pedidoNumero=2090
// Realinha o vencimento dos boletos PENDENTES de um pedido ao vencimento atual das
// parcelas (caso a parcela tenha sido adiada DEPOIS da emissão do boleto).
router.post('/asaas-sincronizar-vencimentos', async (req, res) => {
    try {
        const numero = parseInt(req.query.pedidoNumero, 10) || null;
        if (!numero) return res.status(400).json({ error: 'Informe ?pedidoNumero=' });
        const asaasService = require('../services/asaasService');
        const cobrancas = await prisma.cobrancaAsaas.findMany({
            where: { pedido: { numero, especial: false, bonificacao: false }, tipo: 'BOLETO', status: 'PENDENTE' },
            include: { parcela: { select: { numeroParcela: true, dataVencimento: true } } }
        });
        const resultados = [];
        for (const c of cobrancas) {
            const nova = await asaasService.sincronizarVencimentoBoleto(c.id);
            resultados.push({
                parcela: c.parcela?.numeroParcela,
                vencimentoParcela: c.parcela?.dataVencimento,
                boletoAntes: c.vencimento,
                boletoDepois: nova.vencimento,
                mudou: String(c.vencimento) !== String(nova.vencimento),
                linhaDigitavel: nova.linhaDigitavel
            });
        }
        res.json({ pedido: numero, resultados });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/diag-extrato-asaas-pendentes — SÓ LEITURA. Cruza os CRÉDITOS
// pendentes do extrato Asaas (conciliação) com as cobranças/pedidos/parcelas do app
// para achar descompasso: dinheiro que entrou no Asaas mas cuja parcela está aberta
// ou foi baixada em outra conta (ex.: Caixa trocou a forma no CA e não criou a baixa).
router.get('/diag-extrato-asaas-pendentes', async (req, res) => {
    try {
        const cfg = await prisma.appConfig.findUnique({ where: { key: 'asaas_conta_financeira_ca_id' } });
        const contaAsaas = cfg?.value || null;
        if (!contaAsaas) return res.status(400).json({ error: 'Conta Asaas não vinculada.' });

        const creditos = await prisma.extratoLancamento.findMany({
            where: { contaFinanceiraCaId: contaAsaas, tipo: 'CREDITO', status: 'PENDENTE' },
            orderBy: { data: 'desc' },
            take: 100
        });

        const relatorio = [];
        for (const l of creditos) {
            const item = {
                data: l.data, valor: Number(l.valor), descricao: l.descricao,
                paymentId: l.refNum || null, situacao: 'SEM_COBRANCA_NO_APP', detalhe: null
            };
            const cobranca = l.refNum
                ? await prisma.cobrancaAsaas.findUnique({
                    where: { asaasPaymentId: l.refNum },
                    include: { pedido: { select: { id: true, numero: true, baixaCaRealizada: true, baixaCaEm: true } } }
                })
                : null;
            if (cobranca) {
                item.pedido = cobranca.pedido?.numero || null;
                item.tipoCobranca = cobranca.tipo;
                item.statusCobranca = cobranca.status;
                item.baixaAppOk = cobranca.baixaAppOk;
                item.parcelaVinculada = !!cobranca.parcelaId;

                // Pagamentos registrados na entrega (o vínculo é o que separa PIX Asaas de Pix comum no Caixa)
                if (cobranca.pedidoId) {
                    const pagsReais = await prisma.pedidoPagamentoReal.findMany({
                        where: { pedidoId: cobranca.pedidoId },
                        select: { formaPagamentoNome: true, valor: true, cobrancaAsaasId: true }
                    });
                    item.pagamentosEntrega = pagsReais.map(p => ({
                        forma: p.formaPagamentoNome, valor: Number(p.valor), vinculadoAsaas: !!p.cobrancaAsaasId
                    }));
                    const conta = await prisma.contaReceber.findFirst({
                        where: { pedidoId: cobranca.pedidoId },
                        include: {
                            parcelas: {
                                include: { pagamentos: { where: { estornado: false }, select: { valorRecebido: true, contaFinanceiraCaId: true, formaPagamento: true } } }
                            }
                        }
                    });
                    if (conta) {
                        item.statusConta = conta.status;
                        item.parcelas = conta.parcelas.map(p => ({
                            numero: p.numeroParcela, valor: Number(p.valor), status: p.status,
                            contaFinanceiraCaId: p.contaFinanceiraCaId,
                            baixadaNaContaAsaas: p.contaFinanceiraCaId === contaAsaas,
                            pagamentos: p.pagamentos.map(pg => ({ valor: Number(pg.valorRecebido), conta: pg.contaFinanceiraCaId, forma: pg.formaPagamento }))
                        }));
                        const temAberta = conta.parcelas.some(p => ['PENDENTE', 'PARCIAL'].includes(p.status));
                        const pagaForaAsaas = conta.parcelas.some(p => p.status === 'PAGO' && p.contaFinanceiraCaId && p.contaFinanceiraCaId !== contaAsaas);
                        if (temAberta) {
                            item.situacao = 'DESCOMPASSO_PARCELA_ABERTA';
                            item.detalhe = 'Dinheiro entrou no Asaas mas a parcela segue aberta no app (e provavelmente no CA).';
                        } else if (pagaForaAsaas) {
                            item.situacao = 'BAIXADA_EM_OUTRA_CONTA';
                            item.detalhe = 'Parcela paga, mas registrada em outra conta financeira (não a do Asaas).';
                        } else {
                            item.situacao = 'PAGA_SEM_LEDGER_NA_CONTA';
                            item.detalhe = 'Parcela paga; conferir por que a conciliação não achou a baixa (baixa sem ledger ou sem conta).';
                        }
                    } else {
                        item.situacao = 'PEDIDO_SEM_CONTA_RECEBER';
                    }
                } else {
                    item.situacao = 'COBRANCA_SEM_PEDIDO';
                }
            }
            relatorio.push(item);
        }

        const resumo = {};
        for (const r of relatorio) resumo[r.situacao] = (resumo[r.situacao] || 0) + 1;
        res.json({ contaAsaas, totalCreditosPendentes: creditos.length, resumo, relatorio });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/asaas-emitir-boletos-pedido — emite os boletos Asaas das
// parcelas em aberto de um pedido (mesmo caminho do botão do app; idempotente —
// parcela que já tem boleto PENDENTE reaproveita). Body: { numero }
router.post('/asaas-emitir-boletos-pedido', async (req, res) => {
    try {
        const numero = parseInt(req.body?.numero, 10);
        if (!numero) return res.status(400).json({ error: 'Informe { numero }.' });
        const pedido = await prisma.pedido.findFirst({
            where: { numero, especial: false, bonificacao: false },
            select: { id: true, contaReceber: { select: { id: true, parcelas: { where: { status: { in: ['PENDENTE', 'VENCIDO', 'PARCIAL'] } }, orderBy: { numeroParcela: 'asc' }, select: { id: true, numeroParcela: true } } } } }
        });
        if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });
        if (!pedido.contaReceber) return res.status(400).json({ error: 'Pedido sem conta a receber.' });
        const asaasService = require('../services/asaasService');
        const resultados = [];
        for (const parcela of pedido.contaReceber.parcelas) {
            try {
                const cob = await asaasService.criarBoletoParcela({ parcelaId: parcela.id, criadoPorId: null });
                resultados.push({ parcela: parcela.numeroParcela, ok: true, status: cob.status, vencimento: cob.vencimento, url: cob.boletoUrl });
            } catch (e) {
                resultados.push({ parcela: parcela.numeroParcela, ok: false, erro: e.message });
            }
        }
        res.json({ ok: true, numero, resultados });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/diag-dashboard-vendas — confere as vendas do mês na regra do
// Dashboard Gerencial (FATURADO ou especial, sem bonificação) direto no banco de
// produção: total do mês, últimos 7 dias por dia e o pedido mais recente.
router.get('/diag-dashboard-vendas', async (req, res) => {
    try {
        const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const mes = hoje.slice(0, 7);
        const gte = new Date(`${mes}-01T00:00:00-03:00`);
        const lte = new Date(`${hoje}T23:59:59.999-03:00`);
        const [y, m] = mes.split('-').map(Number);
        const fimMes = new Date(`${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}T23:59:59.999-03:00`);
        const [totalMes, totalMesInteiro, porDia, ultimo, devolucoes] = await Promise.all([
            prisma.$queryRaw`
                SELECT COALESCE(SUM(i.valor * i.quantidade), 0)::float AS total, COUNT(DISTINCT p.id)::int AS pedidos
                FROM pedidos p JOIN pedido_itens i ON i.pedido_id = p.id
                WHERE p.bonificacao = false AND (p.situacao_ca = 'FATURADO' OR p.especial = true)
                  AND p.data_venda >= ${gte} AND p.data_venda <= ${lte}`,
            prisma.$queryRaw`
                SELECT COALESCE(SUM(i.valor * i.quantidade), 0)::float AS total, COUNT(DISTINCT p.id)::int AS pedidos
                FROM pedidos p JOIN pedido_itens i ON i.pedido_id = p.id
                WHERE p.bonificacao = false AND (p.situacao_ca = 'FATURADO' OR p.especial = true)
                  AND p.data_venda >= ${gte} AND p.data_venda <= ${fimMes}`,
            prisma.$queryRaw`
                SELECT to_char((p.data_venda AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS dia,
                       COALESCE(SUM(i.valor * i.quantidade), 0)::float AS total, COUNT(DISTINCT p.id)::int AS pedidos
                FROM pedidos p JOIN pedido_itens i ON i.pedido_id = p.id
                WHERE p.bonificacao = false AND (p.situacao_ca = 'FATURADO' OR p.especial = true)
                  AND p.data_venda >= ${gte}
                GROUP BY 1 ORDER BY 1 DESC LIMIT 10`,
            prisma.pedido.findFirst({
                where: { bonificacao: false },
                orderBy: { createdAt: 'desc' },
                select: { numero: true, createdAt: true, dataVenda: true, situacaoCA: true, especial: true }
            }),
            prisma.devolucao.aggregate({
                _sum: { valorTotal: true },
                where: { status: 'ATIVA', dataDevolucao: { gte, lte } }
            })
        ]);
        res.json({
            hojeSP: hoje,
            regra: 'FATURADO ou especial, sem bonificação, data_venda no período',
            mesAteHoje: { ...totalMes[0] },
            mesInteiro: { ...totalMesInteiro[0], nota: 'é este que o Dashboard Gerencial mostra' },
            devolucoesMes: Number(devolucoes._sum.valorTotal || 0),
            porDia,
            pedidoMaisRecente: ultimo
        });
    } catch (error) {
        console.error('[admin-exec] diag-dashboard-vendas:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin-exec/diag-produto-custo — confere o histórico de custo dos produtos
// (tabela produto_custo_historico) em produção: total de linhas, meses cobertos e
// uma amostra. ?backfill=1 força o backfill inicial se a tabela estiver vazia.
router.get('/diag-produto-custo', async (req, res) => {
    try {
        const produtoMargemService = require('../services/produtoMargemService');
        if (req.query.backfill === '1') {
            const r = await produtoMargemService.backfillInicial(6);
            return res.json({ acao: 'backfill', resultado: r });
        }
        const total = await prisma.produtoCustoHistorico.count();
        const porMes = await prisma.produtoCustoHistorico.groupBy({
            by: ['mesReferencia'],
            _count: { _all: true },
            orderBy: { mesReferencia: 'asc' }
        });
        const amostra = await prisma.produtoCustoHistorico.findMany({
            where: { fonteCusto: 'FICHA' },
            take: 3,
            orderBy: { mesReferencia: 'desc' },
            select: { mesReferencia: true, custoUnitario: true, fonteCusto: true, estimado: true, produto: { select: { nome: true } } }
        });
        res.json({ total, porMes: porMes.map((m) => ({ mes: m.mesReferencia, produtos: m._count._all })), amostraFicha: amostra });
    } catch (error) {
        console.error('[admin-exec] diag-produto-custo:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin-exec/diag-contas-pagar-pdf — onde estão (ou não) os PDFs anexados às despesas.
// ?limpar=1 zera o pdfPath das despesas cujo arquivo sumiu (tira o selo "PDF" da lista).
router.get('/diag-contas-pagar-pdf', async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const DIR_NOVO = path.join(__dirname, '../uploads/contas-pagar');
        const DIR_LEGADO = path.join(__dirname, '../../uploads/contas-pagar');

        const listar = (dir) => {
            try { return fs.readdirSync(dir); } catch { return null; } // null = pasta não existe
        };
        const pastas = {
            novo: { caminho: DIR_NOVO, arquivos: listar(DIR_NOVO) },
            legado: { caminho: DIR_LEGADO, arquivos: listar(DIR_LEGADO) },
            // referência: pastas que sabidamente sobrevivem a deploy
            certificado: { caminho: path.join(__dirname, '../uploads/certificado'), arquivos: listar(path.join(__dirname, '../uploads/certificado')) },
            tarefas: { caminho: path.join(__dirname, '../uploads/tarefas'), arquivos: listar(path.join(__dirname, '../uploads/tarefas')) }
        };
        for (const k of Object.keys(pastas)) {
            pastas[k].qtd = pastas[k].arquivos ? pastas[k].arquivos.length : null;
            pastas[k].arquivos = pastas[k].arquivos ? pastas[k].arquivos.slice(0, 10) : null;
        }

        const contas = await prisma.contaPagar.findMany({
            where: { NOT: { pdfPath: null } },
            select: { id: true, descricao: true, pdfPath: true }
        });
        const achar = (p) => {
            if (!p) return null;
            if (fs.existsSync(p)) return p;
            const nome = path.basename(p);
            for (const d of [DIR_NOVO, DIR_LEGADO]) {
                const alt = path.join(d, nome);
                if (fs.existsSync(alt)) return alt;
            }
            return null;
        };
        const detalhe = contas.map((c) => ({ id: c.id, descricao: c.descricao, pdfPath: c.pdfPath, encontrado: achar(c.pdfPath) }));
        const perdidos = detalhe.filter((d) => !d.encontrado);

        let limpos = 0;
        if (req.query.limpar === '1' && perdidos.length) {
            const r = await prisma.contaPagar.updateMany({ where: { id: { in: perdidos.map((p) => p.id) } }, data: { pdfPath: null } });
            limpos = r.count;
        }

        res.json({
            cwd: process.cwd(),
            dirnameRota: __dirname,
            pastas,
            totalComPdfNoBanco: contas.length,
            ok: detalhe.length - perdidos.length,
            perdidos: perdidos.length,
            listaPerdidos: perdidos.slice(0, 20).map((p) => ({ id: p.id, descricao: p.descricao, pdfPath: p.pdfPath })),
            limpos
        });
    } catch (error) {
        console.error('[admin-exec] diag-contas-pagar-pdf:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin-exec/diag-uploads-persistencia — prova que a pasta de upload sobrevive ao deploy.
// ?gravar=1 escreve um arquivo carimbado em backend/uploads/contas-pagar; chamando de novo DEPOIS
// de uma publicação, o arquivo tem que continuar lá. ?apagar=1 remove os arquivos de teste.
router.get('/diag-uploads-persistencia', async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const DIR = path.join(__dirname, '../uploads/contas-pagar');
        if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

        if (req.query.gravar === '1') {
            const nome = `_teste-persistencia-${Date.now()}.pdf`;
            fs.writeFileSync(path.join(DIR, nome), '%PDF-1.4\n% teste de persistencia do volume\n%%EOF\n');
        }
        if (req.query.apagar === '1') {
            for (const f of fs.readdirSync(DIR)) {
                if (f.startsWith('_teste-persistencia-')) fs.unlinkSync(path.join(DIR, f));
            }
        }

        const arquivos = fs.readdirSync(DIR).map((f) => {
            const st = fs.statSync(path.join(DIR, f));
            return { nome: f, bytes: st.size, criadoEm: st.mtime.toISOString() };
        });
        res.json({ dir: DIR, total: arquivos.length, testes: arquivos.filter((a) => a.nome.startsWith('_teste-persistencia-')), arquivos: arquivos.slice(0, 30) });
    } catch (error) {
        console.error('[admin-exec] diag-uploads-persistencia:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin-exec/testar-alerta-certificado — roda o alerta de validade do A1 na hora.
// Se faltar > 30 dias, só retorna { dias, alertado:false } (não envia WhatsApp) — seguro p/ testar.
router.get('/testar-alerta-certificado', async (req, res) => {
    try {
        const certificadoService = require('../services/certificadoService');
        const r = await certificadoService.alertarValidadeCertificado();
        res.json(r);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/diag-parcela-ca?nota=1802  — diagnóstico de edição de vencimento no CA
router.get('/diag-parcela-ca', async (req, res) => {
    try {
        const { nota } = req.query;
        if (!nota) return res.status(400).json({ error: 'Informe ?nota=NUMERO' });

        const conta = await prisma.contaPagar.findFirst({
            where: { OR: [{ numeroNota: String(nota) }, { descricao: { contains: String(nota) } }] },
            include: { parcelas: { orderBy: { numeroParcela: 'asc' } } },
            orderBy: { criadoEm: 'desc' }
        });
        if (!conta) return res.json({ ok: false, motivo: `Nenhuma conta com nota "${nota}"` });

        const parcelasLocal = conta.parcelas.map((p) => ({
            id: p.id, numeroParcela: p.numeroParcela, status: p.status,
            dataVencimentoLocal: p.dataVencimento, valorLocal: p.valor, idParcelaCA: p.idParcelaCA
        }));

        // Estado REAL no CA da 1ª parcela mapeada (mostra o nome/valor do campo de vencimento no CA)
        let parcelaCA = null;
        const mapeada = conta.parcelas.find((p) => p.idParcelaCA);
        if (mapeada) {
            try {
                const det = await contaAzulService.buscarParcelaDetalhe(mapeada.idParcelaCA);
                parcelaCA = {
                    idParcelaCA: mapeada.idParcelaCA,
                    versao: det?.versao,
                    status: det?.status, status_traduzido: det?.status_traduzido,
                    data_vencimento: det?.data_vencimento, vencimento: det?.vencimento,
                    total: det?.total, valor_composicao: det?.valor_composicao,
                    _chaves: Object.keys(det || {})
                };
            } catch (e) {
                parcelaCA = { erro: e.response?.data || e.message };
            }
        }

        const logs = await prisma.syncLog.findMany({
            where: { tipo: { in: ['PARCELA_ATUALIZAR', 'PARCELA_DETALHE'] } },
            orderBy: { dataHora: 'desc' }, take: 8,
            select: { tipo: true, status: true, mensagem: true, requestMethod: true, responseStatus: true, responseBody: true, dataHora: true }
        });

        res.json({
            ok: true,
            conta: { id: conta.id, descricao: conta.descricao, numeroNota: conta.numeroNota, statusEnvioCA: conta.statusEnvioCA, idEventoCA: conta.idEventoCA },
            parcelasLocal, parcelaCA, logsRecentes: logs
        });
    } catch (error) {
        console.error('[admin-exec] Erro diag-parcela-ca:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin-exec/diag-conciliacao?nota=858860  (ou ?busca=produpan)
// SOMENTE LEITURA: refaz a busca de conciliação ao vivo no CA e mostra por que casou/ não casou.
router.get('/diag-conciliacao', async (req, res) => {
    try {
        const { nota, busca } = req.query;
        const BASE = 'https://api-v2.contaazul.com';
        const fmtDataCA = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const round2 = (v) => Math.round(Number(v) * 100) / 100;

        const where = nota
            ? { numeroNota: { contains: String(nota) } }
            : { OR: [
                { descricao: { contains: String(busca || ''), mode: 'insensitive' } },
                { fornecedor: { razaoSocial: { contains: String(busca || ''), mode: 'insensitive' } } }
              ] };
        const contas = await prisma.contaPagar.findMany({ where, orderBy: { criadoEm: 'desc' }, take: 3, include: { fornecedor: true, parcelas: true } });
        if (contas.length === 0) return res.json({ erro: 'Nenhuma conta encontrada no app', where });

        const info = {
            contasApp: contas.map(c => ({
                id: c.id, numeroNota: c.numeroNota, valorTotal: Number(c.valorTotal),
                statusEnvioCA: c.statusEnvioCA, idEventoCA: c.idEventoCA, erroEnvioCA: c.erroEnvioCA,
                fornecedorCaId: c.fornecedor?.contaAzulId,
                vencs: c.parcelas.map(p => fmtDataCA(p.dataVencimento))
            }))
        };

        const conta = contas[0];
        const numero = String(conta.numeroNota || '').trim();
        const datas = conta.parcelas.map(p => new Date(p.dataVencimento).getTime()).filter(t => !isNaN(t));
        const bc = new Date(conta.competencia || Date.now()).getTime(); if (!isNaN(bc)) datas.push(bc);
        const JAN = 45 * 24 * 60 * 60 * 1000;
        const de = fmtDataCA(new Date(Math.min(...datas) - JAN));
        const ate = fmtDataCA(new Date(Math.max(...datas) + JAN));
        const statusQS = ['RECEBIDO', 'EM_ABERTO', 'ATRASADO', 'RECEBIDO_PARCIAL', 'RENEGOCIADO', 'PERDIDO'].map(s => `&status=${s}`).join('');
        const url = `${BASE}/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?pagina=1&tamanho_pagina=100&data_vencimento_de=${de}&data_vencimento_ate=${ate}${statusQS}`;

        const valorConta = round2(Number(conta.valorTotal || 0));
        const alvoForn = String(conta.fornecedor?.razaoSocial || 'produpan').toLowerCase().split(' ')[0];
        const candidatos = [];
        let pagina = 1, totalItens = null, itensVarridos = 0;
        try {
            while (pagina <= 10) {
                const purl = `${BASE}/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?pagina=${pagina}&tamanho_pagina=100&data_vencimento_de=${de}&data_vencimento_ate=${ate}${statusQS}`;
                const resp = await contaAzulService._axiosGet(purl, 'DIAG_CONCILIA');
                const itens = resp.data?.itens || resp.data?.items || [];
                totalItens = Number(resp.data?.itens_totais || totalItens || 0);
                itensVarridos += itens.length;
                for (const it of itens) {
                    const totalIt = round2(Number(it.total ?? it.nao_pago ?? 0));
                    const desc = String(it.descricao || '');
                    const forn = String(it.fornecedor?.nome || '');
                    const valorBate = Math.abs(totalIt - valorConta) < 0.01;
                    const numNaDesc = numero && desc.includes(numero);
                    const pareceForn = forn.toLowerCase().includes(alvoForn) || desc.toLowerCase().includes('produpan') || desc.includes('858860');
                    if (valorBate || numNaDesc || pareceForn) {
                        let det = {};
                        try {
                            const d = await contaAzulService._axiosGet(`${BASE}/v1/financeiro/eventos-financeiros/parcelas/${it.id}`, 'DIAG_DET');
                            const ev = d.data?.evento || {};
                            det = { evento_id: ev.id, codigo_referencia: ev.codigo_referencia, origem: ev.origem, evento_descricao: ev.descricao };
                        } catch (e) { det = { erroDetalhe: e.message }; }
                        candidatos.push({ parcelaId: it.id, total: totalIt, descricao: desc, fornecedor: forn, valorBate, numeroAppNaDesc: numNaDesc, ...det });
                    }
                }
                if (itens.length < 100) break;
                if (totalItens && pagina * 100 >= totalItens) break;
                pagina++;
            }
        } catch (e) {
            info.buscaErro = e.response?.status ? `HTTP ${e.response.status}: ${JSON.stringify(e.response.data).slice(0, 300)}` : e.message;
        }
        info.busca = { numeroApp: numero, de, ate, itens_totais: totalItens, itensVarridos, paginas: pagina };
        info.candidatos = candidatos;

        // Chama a função REAL de conciliação para confirmar o que ela adotaria hoje (só leitura).
        try {
            const contasPagarCaSyncService = require('../services/contasPagarCaSyncService');
            const adotaria = await contasPagarCaSyncService._encontrarEventoPorNumeroNota(conta);
            info.conciliacaoReal = { adotariaEventoId: adotaria || null };
        } catch (e) {
            info.conciliacaoReal = { erro: e.message };
        }

        // Testa a busca de fornecedor por documento (dedup de cadastro no CA).
        try {
            const cnpj = conta.fornecedor?.cnpjCpf;
            const achado = cnpj ? await contaAzulService.buscarFornecedorPorDocumento(cnpj) : null;
            info.fornecedorNoCA = { cnpj: cnpj || null, appUsaContaAzulId: conta.fornecedor?.contaAzulId || null, buscaPorDocumentoRetornou: achado };
        } catch (e) {
            info.fornecedorNoCA = { erro: e.message };
        }
        res.json(info);
    } catch (error) {
        res.status(500).json({ error: error.message, stack: (error.stack || '').split('\n').slice(0, 5) });
    }
});

// POST /api/admin-exec/kitfesta-reenviar-whatsapp/:numero
// Reenvia (ou envia) ao celular do cliente a confirmação de um pedido do Kit Festa.
// Útil para pedidos criados antes do recurso entrar no ar ou que falharam no envio.
router.post('/kitfesta-reenviar-whatsapp/:numero', async (req, res) => {
    try {
        const numero = parseInt(req.params.numero, 10);
        if (!numero) return res.status(400).json({ error: 'Número de pedido inválido.' });
        const pedido = await prisma.kitFestaPedido.findUnique({ where: { numero } });
        if (!pedido) return res.status(404).json({ error: 'Pedido Kit Festa não encontrado.' });
        const webhookService = require('../services/webhookService');
        const result = await webhookService.notificarPedidoKitFesta(pedido.id);
        res.json({ numero, telefoneCliente: pedido.telefoneCliente, ...result });
    } catch (error) {
        console.error('[admin-exec] Erro kitfesta-reenviar-whatsapp:', error);
        res.status(500).json({ ok: false, motivo: error.message });
    }
});

// GET /api/admin-exec/diag-colunas
// SOMENTE LEITURA. Conta, por tabela, colunas vivas vs "fantasma" (dropped) que
// ainda ocupam vaga no limite de 1600 do Postgres. Usado para diagnosticar o
// estoque de colunas mortas (ex.: tabela "clientes" no teto).
// ── POST /corrigir-tipo-condicao — corrige o tipo de pagamento de uma condição ──
// A condição "À vista - Funcionário" estava cadastrada como BOLETO_BANCARIO (venda a
// funcionário não é boleto — o pedido é especial e nem vai ao CA). Isso a fazia cair no filtro
// "Cobrança = Boleto" de Contas a Receber. Corrige o cadastro (tabela_precos) e o tipo gravado
// nos pedidos já feitos com essa condição.
// Body: { condicaoId: "4000", tipoNovo: "DINHEIRO", aplicar: false }  (aplicar=false → só simula)
router.post('/corrigir-tipo-condicao', async (req, res) => {
    try {
        const { condicaoId, tipoNovo, aplicar } = req.body || {};
        if (!condicaoId || !tipoNovo) {
            return res.status(400).json({ ok: false, error: 'Informe condicaoId e tipoNovo.' });
        }
        const condicao = await prisma.tabelaPreco.findUnique({ where: { id: String(condicaoId) } });
        if (!condicao) return res.status(404).json({ ok: false, error: 'Condição não encontrada.' });

        // `not` no Prisma exclui linhas null — daí o OR explícito para pegar também pedido sem tipo
        const alvoPedidos = {
            nomeCondicaoPagamento: condicao.nomeCondicao,
            OR: [{ tipoPagamento: { not: tipoNovo } }, { tipoPagamento: null }]
        };
        const pedidosAfetados = await prisma.pedido.count({ where: alvoPedidos });

        const resumo = {
            condicao: { id: condicao.id, nome: condicao.nomeCondicao, tipoAtual: condicao.tipoPagamento, tipoNovo },
            pedidosAfetados,
            aplicado: false
        };
        if (!aplicar) return res.json({ ok: true, simulacao: true, ...resumo });

        await prisma.tabelaPreco.update({ where: { id: condicao.id }, data: { tipoPagamento: tipoNovo } });
        const upd = await prisma.pedido.updateMany({ where: alvoPedidos, data: { tipoPagamento: tipoNovo } });
        res.json({ ok: true, simulacao: false, ...resumo, aplicado: true, pedidosAtualizados: upd.count });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

router.get('/diag-colunas', async (req, res) => {
    try {
        const linhas = await prisma.$queryRawUnsafe(`
            SELECT
                c.relname AS tabela,
                count(*) FILTER (WHERE a.attnum > 0 AND NOT a.attisdropped)::int AS colunas_vivas,
                count(*) FILTER (WHERE a.attnum > 0 AND a.attisdropped)::int     AS colunas_fantasma,
                count(*) FILTER (WHERE a.attnum > 0)::int                        AS total_slots
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_attribute a ON a.attrelid = c.oid
            WHERE n.nspname = 'public' AND c.relkind = 'r'
            GROUP BY c.relname
            ORDER BY total_slots DESC
            LIMIT 40
        `);
        res.json({ ok: true, limiteMaximo: 1600, tabelas: linhas });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/recalcular-dia/:diaSigla
// Recalcula insights + orientação para todos os clientes de um dia de rota
router.post('/recalcular-dia/:diaSigla', async (req, res) => {
    const sigla = (req.params.diaSigla || '').toUpperCase().trim();
    const DIAS_VALIDOS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];

    if (!DIAS_VALIDOS.includes(sigla)) {
        return res.status(400).json({ error: `Sigla inválida. Use: ${DIAS_VALIDOS.join(', ')}` });
    }

    try {
        const clientes = await prisma.cliente.findMany({
            where: { Ativo: true, Dia_de_venda: { not: null } },
            select: { UUID: true, Nome: true, NomeFantasia: true, Dia_de_venda: true },
        });

        const filtrados = clientes.filter(c =>
            c.Dia_de_venda.toUpperCase().split(',').map(d => d.trim()).includes(sigla)
        );

        const resultados = [];
        for (const c of filtrados) {
            const insight = await clienteInsightService.recalcularCliente(c.UUID);
            const cat = insight ? orientacaoService.CATALOGO[insight.insightPrincipalTipo] : null;
            resultados.push({
                clienteId: c.UUID,
                nome: c.NomeFantasia || c.Nome,
                cenario: insight?.insightPrincipalTipo ?? null,
                situacao: cat?.situacao ?? null,
                objetivo: cat?.objetivo ?? null,
                canalRecomendado: cat?.canalRecomendado ?? null,
                acaoSugerida: cat?.acaoSugerida ?? null,
                statusRecompra: insight?.statusRecompra ?? null,
                diasSemComprar: insight?.diasSemComprar ?? null,
                ticketRecente: insight?.ticketMedioRecente ? Number(insight.ticketMedioRecente).toFixed(2) : null,
                variacaoTicket: insight?.variacaoTicketPct ? Number(insight.variacaoTicketPct).toFixed(1) + '%' : null,
                atendimentosSemPedido30d: insight?.qtdAtendimentosSemPedido30d ?? null,
                ok: !!insight,
            });
        }

        res.json({ dia: sigla, total: filtrados.length, resultados });
    } catch (error) {
        console.error('[admin-exec] Erro recalcular-dia:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/admin-exec/ia-dia/:diaSigla
// Gera orientação via IA (GPT-4o-mini) para todos os clientes de um dia de rota
router.post('/ia-dia/:diaSigla', async (req, res) => {
    const sigla = (req.params.diaSigla || '').toUpperCase().trim();
    const DIAS_VALIDOS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];
    if (!DIAS_VALIDOS.includes(sigla)) {
        return res.status(400).json({ error: `Sigla inválida. Use: ${DIAS_VALIDOS.join(', ')}` });
    }
    try {
        const clientes = await prisma.cliente.findMany({
            where: { Ativo: true, Dia_de_venda: { not: null } },
            select: { UUID: true, Nome: true, NomeFantasia: true, Dia_de_venda: true }
        });
        const filtrados = clientes.filter(c =>
            c.Dia_de_venda.toUpperCase().split(',').map(d => d.trim()).includes(sigla)
        );
        const resultados = [];
        for (const c of filtrados) {
            try {
                const resultado = await orientacaoService.gerarOrientacaoIA(c.UUID, { disparadoPor: 'MANUAL' });
                resultados.push({ ok: true, ...resultado });
            } catch (err) {
                resultados.push({ ok: false, clienteId: c.UUID, nome: c.NomeFantasia || c.Nome, erro: err.message });
            }
        }
        res.json({ dia: sigla, total: filtrados.length, resultados });
    } catch (error) {
        console.error('[admin-exec] Erro ia-dia:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/admin-exec/migrate-ia-log
// Cria tabela ia_analise_logs se não existir (migração manual)
router.post('/migrate-ia-log', async (req, res) => {
    const steps = [];
    try {
        await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ia_analise_logs" ("id" SERIAL NOT NULL, "cliente_id" TEXT NOT NULL, "vendedor_id" TEXT, "disparado_por" TEXT NOT NULL, "disparado_por_usuario_id" TEXT, "atendimento_id" INTEGER, "modelo" TEXT NOT NULL DEFAULT 'gpt-4o-mini', "prompt_enviado" TEXT NOT NULL, "dados_entrada" JSONB NOT NULL, "resposta_ia" JSONB, "tokens_prompt" INTEGER, "tokens_resposta" INTEGER, "tokens_total" INTEGER, "duracao_ms" INTEGER, "sucesso" BOOLEAN NOT NULL DEFAULT true, "erro_msg" TEXT, "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ia_analise_logs_pkey" PRIMARY KEY ("id"))`);
        steps.push('tabela criada');
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ia_analise_logs_cliente_id_idx" ON "ia_analise_logs"("cliente_id")`);
        steps.push('index cliente_id');
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ia_analise_logs_criado_em_idx" ON "ia_analise_logs"("criado_em" DESC)`);
        steps.push('index criado_em');
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ia_analise_logs_vendedor_id_idx" ON "ia_analise_logs"("vendedor_id")`);
        steps.push('index vendedor_id');
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ia_analise_logs_disparado_por_idx" ON "ia_analise_logs"("disparado_por")`);
        steps.push('index disparado_por');
        // FK com verificação manual (DO $$ não é prepared statement)
        const [fkExiste] = await prisma.$queryRaw`SELECT COUNT(*) as c FROM information_schema.table_constraints WHERE constraint_name = 'ia_analise_logs_cliente_id_fkey'`;
        if (Number(fkExiste.c) === 0) {
            await prisma.$executeRawUnsafe(`ALTER TABLE "ia_analise_logs" ADD CONSTRAINT "ia_analise_logs_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("UUID") ON DELETE RESTRICT ON UPDATE CASCADE`);
            steps.push('FK adicionada');
        } else {
            steps.push('FK já existe');
        }
        // Corrigir tipo da coluna atendimento_id de INTEGER para TEXT (fix UUID)
        try {
            await prisma.$executeRawUnsafe(`ALTER TABLE "ia_analise_logs" ALTER COLUMN "atendimento_id" TYPE TEXT USING "atendimento_id"::text`);
            steps.push('coluna atendimento_id convertida para TEXT');
        } catch (e) {
            steps.push(`atendimento_id já é TEXT ou erro: ${e.message}`);
        }
        res.json({ ok: true, steps, mensagem: 'Tabela ia_analise_logs criada/verificada com sucesso.' });
    } catch (error) {
        console.error('[admin-exec] Erro migrate-ia-log:', error);
        res.status(500).json({ error: error.message, steps });
    }
});

// GET /api/admin-exec/ia-log-status
// Diagnóstico: verifica se iaAnaliseLog está disponível no Prisma e conta registros
router.get('/ia-log-status', async (req, res) => {
    try {
        // 1. Conta via raw SQL (sempre funciona se a tabela existe)
        const [countRaw] = await prisma.$queryRaw`SELECT COUNT(*)::int as total FROM "ia_analise_logs"`;
        // 2. Testa se o model Prisma está disponível
        let prismaModelOk = false;
        let prismaCount = null;
        try {
            prismaCount = await prisma.iaAnaliseLog.count();
            prismaModelOk = true;
        } catch (e) {
            prismaModelOk = false;
        }
        res.json({
            tabelaExiste: true,
            totalRegistrosRaw: countRaw.total,
            prismaModelDisponivel: prismaModelOk,
            prismaCount,
        });
    } catch (error) {
        res.status(500).json({ error: error.message, tabelaExiste: false });
    }
});

// POST /api/admin-exec/limpar-atendimentos-pedido
// Remove atendimentos auto-criados do tipo PEDIDO (gerados erroneamente ao criar pedido)
router.post('/limpar-atendimentos-pedido', async (req, res) => {
    try {
        const result = await prisma.atendimento.deleteMany({ where: { tipo: 'PEDIDO' } });
        res.json({ ok: true, removidos: result.count });
    } catch (error) {
        console.error('[admin-exec] Erro limpar-atendimentos-pedido:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin-exec/debug-pendencias?email=xxx&data=2026-04-21
// Diagnostica o que existe no banco para um vendedor em uma data
router.get('/debug-pendencias', async (req, res) => {
    try {
        const { email, data } = req.query;
        if (!email || !data) return res.status(400).json({ error: 'email e data obrigatórios' });

        const vendedor = await prisma.vendedor.findFirst({ where: { email } });
        if (!vendedor) return res.status(404).json({ error: 'Vendedor não encontrado', email });

        const vendedorId = vendedor.id;
        const inicioDia = new Date(data + 'T00:00:00Z');
        const fimAmanha = new Date(data + 'T23:59:59.999Z');
        fimAmanha.setDate(fimAmanha.getDate() + 1);

        // Clientes da rota do dia
        const SIGLAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
        const sigla = SIGLAS[new Date(data + 'T12:00:00Z').getDay()];
        const todosClientes = await prisma.cliente.findMany({
            where: { idVendedor: vendedorId, Ativo: true, Dia_de_venda: { not: null } },
            select: { UUID: true, NomeFantasia: true, Nome: true, Dia_de_venda: true },
        });
        const clientesDoDia = todosClientes.filter(c =>
            (c.Dia_de_venda || '').toUpperCase().split(',').map(d => d.trim()).includes(sigla)
        );
        const uuids = clientesDoDia.map(c => c.UUID);

        const atendimentos = await prisma.atendimento.findMany({
            where: { clienteId: { in: uuids }, criadoEm: { gte: inicioDia, lte: fimAmanha }, tipo: { not: 'FINANCEIRO' } },
            select: { id: true, tipo: true, criadoEm: true, observacao: true, clienteId: true, cliente: { select: { NomeFantasia: true } } },
        });
        const pedidos = await prisma.pedido.findMany({
            where: { clienteId: { in: uuids }, createdAt: { gte: inicioDia, lte: fimAmanha } },
            select: { id: true, createdAt: true, dataVenda: true, clienteId: true, cliente: { select: { NomeFantasia: true } } },
        });

        const atendidos = new Set([...atendimentos.map(a => a.clienteId), ...pedidos.map(p => p.clienteId)]);
        const pendentes = clientesDoDia.filter(c => !atendidos.has(c.UUID));

        res.json({
            vendedor: vendedor.nome || vendedor.email,
            vendedorId,
            sigla,
            totalRota: clientesDoDia.length,
            atendimentos: atendimentos.length,
            pedidos: pedidos.length,
            pendentes: pendentes.length,
            clientesPendentes: pendentes.map(c => c.NomeFantasia || c.Nome),
            detalheAtendimentos: atendimentos,
            detalhePedidos: pedidos,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin-exec/debug-cliente-atendimentos?clienteId=xxx
// Últimos atendimentos de um cliente (sem filtro de data)
router.get('/debug-cliente-atendimentos', async (req, res) => {
    try {
        const { clienteId } = req.query;
        if (!clienteId) return res.status(400).json({ error: 'clienteId obrigatório' });
        const atendimentos = await prisma.atendimento.findMany({
            where: { clienteId },
            select: { id: true, tipo: true, acaoKey: true, acaoLabel: true, observacao: true, criadoEm: true, idVendedor: true },
            orderBy: { criadoEm: 'desc' },
            take: 10,
        });
        res.json({ total: atendimentos.length, atendimentos });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/admin-exec/recalcular-todos
// Recalcula insights de TODOS os clientes ativos
router.post('/recalcular-todos', async (req, res) => {
    res.json({ ok: true, mensagem: 'Recálculo iniciado em background.' });
    setImmediate(() => {
        clienteInsightService.recalcularTodosClientes().catch(console.error);
    });
});

// GET /api/admin-exec/diag-receber-conciliacao?pedido=2033  (SOMENTE LEITURA)
// Mostra, para um pedido, o ledger de recebimentos (PagamentoParcela) com a conta
// financeira de cada baixa, a conta Asaas, e os lançamentos do extrato pendentes
// na conta Asaas — para diagnosticar por que um crédito do Asaas não acha par.
router.get('/diag-receber-conciliacao', async (req, res) => {
    try {
        const numero = parseInt(req.query.pedido, 10);
        if (!numero) return res.status(400).json({ error: 'Informe ?pedido=NUMERO' });
        const ymd = (d) => d ? new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : null;

        const pedido = await prisma.pedido.findFirst({ where: { numero }, select: { id: true, numero: true } });
        if (!pedido) return res.json({ ok: false, motivo: `Nenhum pedido ${numero}` });

        const contas = await prisma.contaReceber.findMany({
            where: { pedidoId: pedido.id },
            select: {
                id: true, status: true, valorTotal: true,
                parcelas: {
                    select: {
                        id: true, numeroParcela: true, valor: true, valorPago: true, status: true,
                        contaFinanceiraCaId: true, dataPagamento: true,
                        pagamentos: {
                            select: {
                                id: true, valorRecebido: true, formaPagamento: true, contaFinanceiraCaId: true,
                                dataPagamento: true, estornado: true, observacao: true
                            },
                            orderBy: { dataPagamento: 'asc' }
                        }
                    }
                }
            }
        });

        // Conta Asaas (pela integração) + nome das contas envolvidas
        const asaasCfg = await prisma.appConfig.findUnique({ where: { key: 'asaas_conta_financeira_ca_id' } }).catch(() => null);
        const asaasContaId = (typeof asaasCfg?.value === 'string' && asaasCfg.value) ? asaasCfg.value : null;
        const contasFin = await prisma.contaFinanceira.findMany({ select: { id: true, nomeBanco: true } });
        const nomeConta = (id) => contasFin.find((c) => c.id === id)?.nomeBanco || (id ? '(conta não cadastrada)' : '(sem conta)');

        const ledger = [];
        for (const cr of contas) {
            for (const p of cr.parcelas) {
                for (const pg of p.pagamentos) {
                    ledger.push({
                        parcela: p.numeroParcela, valorRecebido: Number(pg.valorRecebido), forma: pg.formaPagamento,
                        contaFinanceiraCaId: pg.contaFinanceiraCaId, conta: nomeConta(pg.contaFinanceiraCaId),
                        ehAsaas: !!asaasContaId && pg.contaFinanceiraCaId === asaasContaId,
                        data: ymd(pg.dataPagamento), estornado: pg.estornado
                    });
                }
            }
        }

        // Lançamentos do extrato pendentes na conta Asaas com valor 10 (o crédito do exemplo)
        const extratoAsaas = asaasContaId ? await prisma.extratoLancamento.findMany({
            where: { contaFinanceiraCaId: asaasContaId, status: 'PENDENTE', tipo: 'CREDITO' },
            select: { id: true, data: true, valor: true, descricao: true, status: true },
            orderBy: { data: 'desc' }, take: 30
        }) : [];

        res.json({
            ok: true,
            pedido: numero,
            asaasContaId, asaasContaNome: nomeConta(asaasContaId),
            parcelas: contas.flatMap((c) => c.parcelas.map((p) => ({
                numeroParcela: p.numeroParcela, valor: Number(p.valor), valorPago: Number(p.valorPago || 0),
                status: p.status, contaFinanceiraCaId: p.contaFinanceiraCaId, conta: nomeConta(p.contaFinanceiraCaId)
            }))),
            ledgerRecebimentos: ledger,
            temRecebimentoAsaas: ledger.some((l) => l.ehAsaas && !l.estornado),
            extratoAsaasPendenteCredito: extratoAsaas.map((l) => ({ ...l, valor: Number(l.valor), data: ymd(l.data) }))
        });
    } catch (error) {
        console.error('[admin-exec] Erro diag-receber-conciliacao:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin-exec/debug-contas-receber-abertas — diagnóstico de contas ABERTO/PARCIAL por status do pedido
router.get('/debug-contas-receber-abertas', async (req, res) => {
    try {
        const contas = await prisma.contaReceber.findMany({
            where: { status: { in: ['ABERTO', 'PARCIAL'] } },
            select: {
                id: true, status: true, origem: true,
                pedido: { select: { numero: true, statusEnvio: true, situacaoCA: true, bonificacao: true, especial: true } }
            },
            orderBy: { createdAt: 'asc' }
        });

        const agrupado = {};
        for (const c of contas) {
            const key = c.pedido
                ? `pedido: statusEnvio=${c.pedido.statusEnvio} | situacaoCA=${c.pedido.situacaoCA} | bonificacao=${c.pedido.bonificacao} | especial=${c.pedido.especial}`
                : 'sem pedido (ESPECIAL)';
            if (!agrupado[key]) agrupado[key] = { count: 0, exemplos: [] };
            agrupado[key].count++;
            if (agrupado[key].exemplos.length < 5) {
                agrupado[key].exemplos.push({
                    contaStatus: c.status,
                    pedidoNumero: c.pedido?.numero || null
                });
            }
        }

        res.json({ total: contas.length, agrupado });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/cancelar-contas-pedido-excluido — cancela contas cujo pedido foi excluído/cancelado no CA
router.post('/cancelar-contas-pedido-excluido', async (req, res) => {
    try {
        const contas = await prisma.contaReceber.findMany({
            where: {
                status: { in: ['ABERTO', 'PARCIAL'] },
                pedido: {
                    OR: [
                        { statusEnvio: 'EXCLUIDO' },
                        { situacaoCA: { in: ['CANCELADO', 'EXCLUIDO'] } }
                    ]
                }
            },
            select: { id: true, pedido: { select: { numero: true, statusEnvio: true, situacaoCA: true, bonificacao: true } } }
        });

        let canceladas = 0;
        for (const c of contas) {
            await prisma.$transaction([
                prisma.parcela.updateMany({
                    where: { contaReceberId: c.id, status: { notIn: ['PAGO'] } },
                    data: { status: 'CANCELADO' }
                }),
                prisma.contaReceber.update({
                    where: { id: c.id },
                    data: { status: 'CANCELADO' }
                })
            ]);
            canceladas++;
        }

        res.json({
            ok: true,
            canceladas,
            detalhes: contas.map(c => ({ pedidoNumero: c.pedido?.numero, statusEnvio: c.pedido?.statusEnvio, situacaoCA: c.pedido?.situacaoCA, bonificacao: c.pedido?.bonificacao }))
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/debug-inadimplencia?clienteId=xxx — parcelas vencidas PENDENTES de um cliente
router.get('/debug-inadimplencia', async (req, res) => {
    try {
        const { clienteId } = req.query;
        if (!clienteId) return res.status(400).json({ error: 'clienteId obrigatório' });
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

        const parcelas = await prisma.parcela.findMany({
            where: {
                status: 'PENDENTE',
                dataVencimento: { lt: hoje },
                contaReceber: { clienteId, status: { in: ['ABERTO', 'PARCIAL'] } }
            },
            include: {
                contaReceber: {
                    select: { id: true, status: true, origem: true, pedidoId: true,
                        pedido: { select: { numero: true, statusEnvio: true, situacaoCA: true } } }
                }
            }
        });

        const todasContas = await prisma.contaReceber.findMany({
            where: { clienteId },
            select: { id: true, status: true, origem: true,
                pedido: { select: { numero: true, statusEnvio: true, situacaoCA: true } },
                parcelas: { select: { status: true, dataVencimento: true, valor: true } }
            }
        });

        res.json({ parcelasVencidasPendentes: parcelas.length, parcelas, todasContas });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/cancelar-contas-bonificacao — cancela contasReceber de pedidos bonificação (não deveriam existir)
router.post('/cancelar-contas-bonificacao', async (req, res) => {
    try {
        const contas = await prisma.contaReceber.findMany({
            where: { status: { in: ['ABERTO', 'PARCIAL'] }, pedido: { bonificacao: true } },
            select: { id: true, pedido: { select: { numero: true } } }
        });

        let canceladas = 0;
        for (const c of contas) {
            await prisma.$transaction([
                prisma.parcela.updateMany({
                    where: { contaReceberId: c.id, status: { notIn: ['PAGO'] } },
                    data: { status: 'CANCELADO' }
                }),
                prisma.contaReceber.update({ where: { id: c.id }, data: { status: 'CANCELADO' } })
            ]);
            canceladas++;
        }

        res.json({ ok: true, canceladas, pedidos: contas.map(c => c.pedido?.numero) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/listar-contas-sem-pedido — lista todas as contas sem pedido vinculado (especial de teste)
router.get('/listar-contas-sem-pedido', async (req, res) => {
    try {
        const contas = await prisma.contaReceber.findMany({
            where: { pedidoId: null },
            select: {
                id: true, status: true, origem: true,
                valorTotal: true, createdAt: true,
                cliente: { select: { Nome: true, NomeFantasia: true } },
                parcelas: { select: { id: true, status: true, valor: true, dataVencimento: true } }
            },
            orderBy: { createdAt: 'asc' }
        });
        res.json({ total: contas.length, contas });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/deletar-contas-ids — deleta permanentemente contas a receber por IDs
// Body: { ids: ["id1","id2",...] }
router.post('/deletar-contas-ids', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Body deve conter { ids: [...] }' });
        }
        const deletadas = [];
        for (const id of ids) {
            const conta = await prisma.contaReceber.findUnique({
                where: { id },
                select: { id: true, status: true, cliente: { select: { Nome: true } }, pedidoId: true }
            });
            if (!conta) { deletadas.push({ id, status: 'não encontrada' }); continue; }
            await prisma.$transaction([
                prisma.parcela.deleteMany({ where: { contaReceberId: id } }),
                prisma.contaReceber.delete({ where: { id } })
            ]);
            deletadas.push({ id, cliente: conta.cliente?.Nome, status: 'deletada' });
        }
        res.json({ ok: true, deletadas });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/setar-combustivel — define tipoCombustivel em veículos pelo array {placa, tipo}
router.post('/setar-combustivel', async (req, res) => {
    try {
        const { veiculos } = req.body; // [{ placa: 'RLB6E01', tipo: 'DIESEL' }, ...]
        if (!Array.isArray(veiculos)) return res.status(400).json({ error: 'veiculos deve ser array' });
        const resultados = [];
        for (const { placa, tipo } of veiculos) {
            const v = await prisma.veiculo.findUnique({ where: { placa: placa.toUpperCase() } });
            if (!v) { resultados.push({ placa, ok: false, erro: 'não encontrado' }); continue; }
            await prisma.veiculo.update({ where: { id: v.id }, data: { tipoCombustivel: tipo } });
            resultados.push({ placa, ok: true, tipo });
        }
        res.json({ ok: true, resultados });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/debug-charge/:pedidoId — retorna raw do CA para cobranças do pedido
router.get('/debug-charge/:pedidoId', async (req, res) => {
    try {
        const contaAzulService = require('../services/contaAzulService');
        const axios = require('axios');

        const pedido = await prisma.pedido.findUnique({
            where: { id: req.params.pedidoId },
            include: { cliente: { select: { UUID: true } } }
        });
        if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
        if (!pedido.idVendaContaAzul) return res.status(400).json({ error: 'Pedido sem idVendaContaAzul' });

        const dataVendaStr = new Date(pedido.dataVenda).toISOString().split('T')[0];
        const parcelas = await contaAzulService.encontrarParcelasDeVenda(
            pedido.cliente.UUID, pedido.idVendaContaAzul, dataVendaStr
        );

        const token = await contaAzulService.getAccessToken();
        const resultado = [];

        for (const parcela of parcelas) {
            const solicitacoes = parcela.solicitacoes_cobrancas || [];
            for (const cob of solicitacoes) {
                if (!cob?.id) continue;
                try {
                    const r = await axios.get(`https://api-v2.contaazul.com/v1/charge/${cob.id}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    resultado.push({ cobObj: cob, chargeRaw: r.data });
                } catch (e) {
                    resultado.push({ cobObj: cob, erro: e.response?.data || e.message });
                }
            }
        }

        res.json({ pedidoId: pedido.id, idVendaCA: pedido.idVendaContaAzul, parcelas: parcelas.length, cobranças: resultado });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/export-full-db
// Exporta todas as tabelas como JSON para backup/sync local.
// Query param opcional: ?skip=sync_logs,ia_analise_logs
router.get('/export-full-db', async (req, res) => {
    const skip = (req.query.skip || '').split(',').filter(Boolean);

    const ALL_TABLES = [
        'categorias_produto', 'categorias_estoque', 'categorias_cliente',
        'condicoes_pagamento', 'tabela_precos', 'contas_financeiras',
        'formas_pagamento_entrega', 'delivery_categorias',
        'app_configs', 'conta_azul_config',
        'vendedores', 'veiculos',
        'produtos', 'produto_imagens',
        'clientes', 'cliente_arquivos',
        'leads', 'embarques',
        'amostras', 'amostra_itens',
        'pedidos', 'pedido_itens', 'pedido_pagamentos_reais',
        'entrega_itens_devolvidos', 'movimentacoes_estoque',
        'atendimentos',
        'devolucoes', 'devolucao_itens',
        'diario_vendedor', 'despesas',
        'caixa_diario', 'caixa_entrega_conferida',
        'contas_receber', 'parcelas',
        'promocoes', 'promocao_condicao_grupos', 'promocao_condicoes',
        'cliente_insights', 'ia_analise_logs',
        'roteirizacoes',
        'meta_mensal_vendedor', 'meta_cidades', 'meta_produtos', 'meta_promocoes',
        'delivery_status', 'delivery_permissoes', 'delivery_webhook_logs',
        'audit_logs', 'manutencao_alertas',
        'itens_pcp', 'receitas', 'receita_itens', 'receita_versao_log',
        'ordens_producao', 'ordens_consumo', 'agenda_producao',
        'movimentacoes_pcp', 'sugestoes_producao',
        'sync_logs',
    ];

    const tables = ALL_TABLES.filter(t => !skip.includes(t));

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="backup.json"');

    res.write('{"_exportedAt":"' + new Date().toISOString() + '"');

    for (const table of tables) {
        try {
            const rows = await prisma.$queryRawUnsafe(
                `SELECT row_to_json(t)::text AS r FROM (SELECT * FROM "${table}") t`
            );
            const parsed = rows.map(r => { try { return JSON.parse(r.r); } catch { return r.r; } });
            res.write(',\n"' + table + '":' + JSON.stringify(parsed));
            console.log(`[export-full-db] ${table}: ${rows.length} rows`);
        } catch (e) {
            console.error(`[export-full-db] Erro em ${table}:`, e.message);
            res.write(',\n"' + table + '_error":"' + e.message.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
        }
    }

    res.end('\n}');
});

// GET /api/admin-exec/especiais-abertos — lista pedidos especiais entregues com conta ainda aberta
router.get('/especiais-abertos', async (req, res) => {
    try {
        const contas = await prisma.contaReceber.findMany({
            where: {
                status: { in: ['ABERTO', 'PARCIAL'] },
                pedido: {
                    especial: true,
                    statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL'] }
                }
            },
            include: {
                cliente: { select: { NomeFantasia: true, Nome: true } },
                pedido: {
                    select: {
                        numero: true, statusEntrega: true, dataEntrega: true,
                        pagamentosReais: { where: { valor: { gt: 0 } }, select: { formaPagamentoNome: true, valor: true, escritorioResponsavel: true } }
                    }
                },
                parcelas: { where: { status: { not: 'CANCELADO' } }, select: { id: true, numeroParcela: true, status: true, valor: true } }
            }
        });

        const resultado = contas.map(c => {
            const pgtos = c.pedido?.pagamentosReais || [];
            const totalCaixa = pgtos.filter(p => !p.escritorioResponsavel).reduce((s, p) => s + Number(p.valor), 0);
            const totalParcelas = c.parcelas.filter(p => p.status !== 'PAGO').reduce((s, p) => s + Number(p.valor), 0);
            return {
                contaId: c.id,
                pedidoNumero: c.pedido?.numero,
                cliente: c.cliente?.NomeFantasia || c.cliente?.Nome,
                statusEntrega: c.pedido?.statusEntrega,
                dataEntrega: c.pedido?.dataEntrega,
                totalCaixa,
                totalParcelasAbertas: totalParcelas,
                cobreTotal: totalCaixa >= totalParcelas - 0.05,
                pagamentos: pgtos,
                parcelas: c.parcelas
            };
        });

        res.json({ total: resultado.length, casos: resultado });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/corrigir-especiais-abertos — baixa automaticamente as contas elegíveis
router.post('/corrigir-especiais-abertos', async (req, res) => {
    try {
        const { executar = false } = req.body;
        const contas = await prisma.contaReceber.findMany({
            where: {
                status: { in: ['ABERTO', 'PARCIAL'] },
                pedido: { especial: true, statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL'] } }
            },
            include: {
                pedido: { select: { numero: true, vendedorId: true, pagamentosReais: { where: { valor: { gt: 0 } } } } },
                parcelas: { where: { status: { not: 'CANCELADO' } } }
            }
        });

        const elegíveis = contas.filter(c => {
            const pgtos = c.pedido?.pagamentosReais || [];
            const totalCaixa = pgtos.filter(p => !p.escritorioResponsavel).reduce((s, p) => s + Number(p.valor), 0);
            const totalAberto = c.parcelas.filter(p => p.status !== 'PAGO').reduce((s, p) => s + Number(p.valor), 0);
            return totalAberto > 0 && totalCaixa >= totalAberto - 0.05;
        });

        if (!executar) {
            return res.json({ simulacao: true, totalElegíveis: elegíveis.length, pedidos: elegíveis.map(c => c.pedido?.numero) });
        }

        let corrigidos = 0;
        for (const conta of elegíveis) {
            const pgtos = conta.pedido?.pagamentosReais || [];
            const forma = pgtos.filter(p => !p.escritorioResponsavel)[0]?.formaPagamentoNome || 'Dinheiro';
            const baixadoPorId = conta.pedido?.vendedorId;
            const hoje = new Date();

            await prisma.$transaction(async (tx) => {
                for (const parcela of conta.parcelas) {
                    if (parcela.status === 'PAGO') continue;
                    await tx.parcela.update({
                        where: { id: parcela.id },
                        data: {
                            status: 'PAGO',
                            valorPago: Number(parcela.valor),
                            formaPagamento: forma,
                            dataPagamento: hoje,
                            baixadoPorId: baixadoPorId || null,
                            observacao: 'Correção retroativa — pagamento já registrado na entrega'
                        }
                    });
                }
                await tx.contaReceber.update({ where: { id: conta.id }, data: { status: 'QUITADO' } });
            }, { timeout: 20000, maxWait: 10000 });
            corrigidos++;
        }

        res.json({ corrigidos, pedidos: elegíveis.map(c => c.pedido?.numero) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/db-push — executa prisma db push (cria tabelas novas sem migration)
router.post('/db-push', async (req, res) => {
    const { execSync } = require('child_process');
    try {
        const out = execSync('npx prisma db push --skip-generate --accept-data-loss 2>&1', {
            cwd: process.cwd(),
            timeout: 60000,
            env: { ...process.env },
        }).toString();
        res.json({ ok: true, output: out });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message, output: e.stdout?.toString() });
    }
});

// POST /api/admin-exec/import-curriculos — importa os currículos do CSV incluído no repositório
router.post('/import-curriculos', async (req, res) => {
    const { execSync } = require('child_process');
    const path = require('path');
    const csvPath = path.join(process.cwd(), 'scripts', 'Curriculos.csv');
    try {
        const out = execSync(`node scripts/importarCurriculos.js "${csvPath}" 2>&1`, {
            cwd: process.cwd(),
            timeout: 120000,
            env: { ...process.env },
        }).toString();
        res.json({ ok: true, output: out });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message, output: e.stdout?.toString() });
    }
});

// GET /api/admin-exec/estoque-reconciliacao — reconciliação completa por produto desde uma data
// Query param: ?desde=2026-04-01
router.get('/estoque-reconciliacao', async (req, res) => {
    try {
        const desde = req.query.desde || '2026-04-01';

        // Última movimentação ANTES de 'desde' → estoque_depois é o saldo inicial do período
        const iniciais = await prisma.$queryRawUnsafe(`
            SELECT DISTINCT ON (produto_id)
                produto_id,
                estoque_depois AS estoque_inicial
            FROM movimentacoes_estoque
            WHERE created_at < $1::timestamp
            ORDER BY produto_id, created_at DESC
        `, desde + 'T00:00:00');

        // Se produto não tem movimento antes de 'desde', pegar estoque_antes do primeiro movimento no período
        const primeiros = await prisma.$queryRawUnsafe(`
            SELECT DISTINCT ON (produto_id)
                produto_id,
                estoque_antes AS estoque_inicial
            FROM movimentacoes_estoque
            WHERE created_at >= $1::timestamp
            ORDER BY produto_id, created_at ASC
        `, desde + 'T00:00:00');

        // Movimentos por produto/tipo/motivo NO período
        const movimentos = await prisma.$queryRawUnsafe(`
            SELECT
                m.produto_id,
                p.nome AS produto_nome,
                m.tipo,
                m.motivo,
                SUM(m.quantidade) AS total_qtd,
                COUNT(*) AS num_movs
            FROM movimentacoes_estoque m
            JOIN produtos p ON p.id = m.produto_id
            WHERE m.created_at >= $1::timestamp
            GROUP BY m.produto_id, p.nome, m.tipo, m.motivo
            ORDER BY p.nome, m.tipo, m.motivo
        `, desde + 'T00:00:00');

        // Estoque atual (último movimento de todos os tempos)
        const atuais = await prisma.$queryRawUnsafe(`
            SELECT DISTINCT ON (produto_id)
                produto_id,
                estoque_depois AS estoque_atual,
                created_at AS ultima_mov
            FROM movimentacoes_estoque
            ORDER BY produto_id, created_at DESC
        `);

        // Montar mapa
        const mapaInicial = {};
        for (const r of iniciais) mapaInicial[r.produto_id] = Number(r.estoque_inicial);
        for (const r of primeiros) {
            if (mapaInicial[r.produto_id] === undefined)
                mapaInicial[r.produto_id] = Number(r.estoque_inicial);
        }
        const mapaAtual = {};
        for (const r of atuais) mapaAtual[r.produto_id] = { estoque: Number(r.estoque_atual), ultimaMov: r.ultima_mov };

        // Agrupar por produto
        const porProduto = {};
        for (const m of movimentos) {
            const pid = m.produto_id;
            if (!porProduto[pid]) {
                porProduto[pid] = {
                    nome: m.produto_nome,
                    estoqueInicial: mapaInicial[pid] ?? 0,
                    estoqueAtual: mapaAtual[pid]?.estoque ?? 0,
                    ultimaMov: mapaAtual[pid]?.ultimaMov,
                    entradas: {},
                    saidas: {},
                    totalEntradas: 0,
                    totalSaidas: 0,
                };
            }
            const qtd = Number(m.total_qtd);
            if (m.tipo === 'ENTRADA') {
                porProduto[pid].entradas[m.motivo] = (porProduto[pid].entradas[m.motivo] || 0) + qtd;
                porProduto[pid].totalEntradas += qtd;
            } else {
                porProduto[pid].saidas[m.motivo] = (porProduto[pid].saidas[m.motivo] || 0) + qtd;
                porProduto[pid].totalSaidas += qtd;
            }
        }

        // Verificar equação: inicial + entradas - saidas = atual
        const resultado = Object.values(porProduto).map(p => {
            const calculado = p.estoqueInicial + p.totalEntradas - p.totalSaidas;
            return {
                ...p,
                calculado,
                bate: Math.abs(calculado - p.estoqueAtual) < 0.001,
                diferenca: p.estoqueAtual - calculado,
            };
        });

        const inconsistentes = resultado.filter(p => !p.bate);
        const negativos = resultado.filter(p => p.estoqueAtual < 0);

        res.json({ desde, totalProdutos: resultado.length, inconsistentes: inconsistentes.length, negativos: negativos.length, produtos: resultado });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/estoque-status — resumo do estoque atual (último movimento por produto)
router.get('/estoque-status', async (req, res) => {
    try {
        const rows = await prisma.$queryRawUnsafe(`
            SELECT
                p.nome,
                p.id AS produto_id,
                m.tipo,
                m.motivo,
                m.estoque_depois AS estoque_atual,
                m.created_at AS ultima_mov,
                tot.total_entradas,
                tot.total_saidas
            FROM (
                SELECT DISTINCT ON (produto_id)
                    produto_id, tipo, motivo,
                    estoque_depois,
                    created_at
                FROM movimentacoes_estoque
                ORDER BY produto_id, created_at DESC
            ) m
            JOIN produtos p ON p.id = m.produto_id
            LEFT JOIN (
                SELECT
                    produto_id,
                    SUM(CASE WHEN tipo = 'ENTRADA' THEN quantidade ELSE 0 END) AS total_entradas,
                    SUM(CASE WHEN tipo = 'SAIDA'   THEN quantidade ELSE 0 END) AS total_saidas
                FROM movimentacoes_estoque
                GROUP BY produto_id
            ) tot ON tot.produto_id = m.produto_id
            ORDER BY p.nome
        `);
        const resultado = rows.map(r => ({
            nome: r.nome,
            estoqueAtual: Number(r.estoque_atual),
            ultimaMov: r.ultima_mov,
            totalEntradas: Number(r.total_entradas || 0),
            totalSaidas: Number(r.total_saidas || 0),
        }));
        const negativos = resultado.filter(r => r.estoqueAtual < 0);
        res.json({ total: resultado.length, negativos: negativos.length, produtos: resultado });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/diag-estoque-produto?nome=<parte do nome>&desde=YYYY-MM-DD
// Pente fino READ-ONLY de UM produto: todas as movimentações do período (com vendedor
// e pedido), pedidos que contêm o produto, devoluções de entrega e devoluções formais.
// A análise/cruzamento é feita por quem consome — aqui só devolve os dados escopados.
router.get('/diag-estoque-produto', async (req, res) => {
    try {
        const { nome } = req.query;
        if (!nome) return res.status(400).json({ error: 'Informe ?nome= (parte do nome do produto).' });
        const desde = new Date((req.query.desde || '2026-05-21') + 'T00:00:00-03:00');

        const produto = await prisma.produto.findFirst({
            where: { nome: { contains: nome, mode: 'insensitive' } },
            select: {
                id: true, nome: true, codigo: true, categoria: true, controlaEstoque: true,
                estoqueTotal: true, estoqueReservado: true, estoqueDisponivel: true, updatedAt: true
            }
        });
        if (!produto) return res.status(404).json({ error: 'Produto não encontrado.' });

        const [movAnterior, movimentos, pedidos, devolvidosEntrega, devolucaoItens] = await Promise.all([
            // última movimentação ANTES do período → saldo inicial
            prisma.movimentacaoEstoque.findFirst({
                where: { produtoId: produto.id, createdAt: { lt: desde } },
                orderBy: { createdAt: 'desc' },
                select: { createdAt: true, tipo: true, motivo: true, quantidade: true, estoqueAntes: true, estoqueDepois: true }
            }),
            prisma.movimentacaoEstoque.findMany({
                where: { produtoId: produto.id, createdAt: { gte: desde } },
                orderBy: { createdAt: 'asc' },
                include: {
                    vendedor: { select: { nome: true } },
                    pedido: { select: { numero: true, statusEnvio: true, statusEntrega: true, especial: true, bonificacao: true } }
                }
            }),
            prisma.pedido.findMany({
                where: {
                    itens: { some: { produtoId: produto.id } },
                    OR: [{ dataVenda: { gte: desde } }, { createdAt: { gte: desde } }]
                },
                orderBy: { createdAt: 'asc' },
                select: {
                    id: true, numero: true, statusEnvio: true, situacaoCA: true, statusEntrega: true,
                    especial: true, bonificacao: true, dataVenda: true, dataEntrega: true, createdAt: true,
                    itens: { where: { produtoId: produto.id }, select: { quantidade: true } },
                    cliente: { select: { Nome: true } },
                    vendedor: { select: { nome: true } }
                }
            }),
            prisma.entregaItemDevolvido.findMany({
                where: { produtoId: produto.id, createdAt: { gte: desde } },
                select: { pedidoId: true, quantidade: true, createdAt: true, pedido: { select: { numero: true } } }
            }),
            prisma.devolucaoItem.findMany({
                where: { produtoId: produto.id, devolucao: { dataDevolucao: { gte: desde } } },
                select: {
                    quantidade: true,
                    devolucao: {
                        select: {
                            numero: true, tipo: true, escopo: true, status: true, dataDevolucao: true,
                            pedidoOriginalId: true, pedidoOriginal: { select: { numero: true } }
                        }
                    }
                }
            })
        ]);

        res.json({ desde, produto, movAnterior, movimentos, pedidos, devolvidosEntrega, devolucaoItens });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/estoque-produtos?categoria=Produto%20Acabado
// Lista produtos de uma categoria com estoque atual e se controlam estoque
// (base para rodar a correção retroativa produto a produto).
router.get('/estoque-produtos', async (req, res) => {
    try {
        const categoria = req.query.categoria;
        if (!categoria) return res.status(400).json({ error: 'Informe ?categoria=' });
        const produtos = await prisma.produto.findMany({
            where: { categoria },
            orderBy: { nome: 'asc' },
            select: {
                id: true, nome: true, codigo: true, ativo: true, categoria: true,
                controlaEstoque: true, estoqueTotal: true, estoqueReservado: true, estoqueDisponivel: true
            }
        });
        const saida = [];
        for (const p of produtos) {
            const controla = await estoqueService.produtoControlaEstoque(p);
            saida.push({ ...p, controla });
        }
        res.json({ categoria, total: saida.length, produtos: saida });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/estoque-corrigir-retroativo
// Corrige retroativamente o estoque de UM produto desde uma data:
//  - pedido RECEBIDO sem baixa (bug do especial/bonificação) → registra a SAIDA que faltou
//  - pedido com baixa em dobro → credita a diferença (ENTRADA AJUSTE_MANUAL)
// Compara a quantidade do pedido com o saldo efetivamente baixado (saídas − estornos),
// então é idempotente: rodar de novo encontra delta 0 e não mexe em nada.
// Body: { produtoId | produtoNome, desde='2026-05-21', executar=false } — executar=false só simula.
router.post('/estoque-corrigir-retroativo', async (req, res) => {
    try {
        const { produtoId, produtoNome, desde: desdeStr, executar = false } = req.body || {};
        if (!produtoId && !produtoNome) return res.status(400).json({ error: 'Informe produtoId ou produtoNome.' });
        const desde = new Date((desdeStr || '2026-05-21') + 'T00:00:00-03:00');

        const produto = await prisma.produto.findFirst({
            where: produtoId ? { id: produtoId } : { nome: { contains: produtoNome, mode: 'insensitive' } },
            select: { id: true, nome: true, estoqueTotal: true }
        });
        if (!produto) return res.status(404).json({ error: 'Produto não encontrado.' });

        const pedidos = await prisma.pedido.findMany({
            where: {
                statusEnvio: 'RECEBIDO',
                // situacaoCA null entra (pedido recém-sincronizado); CANCELADO fica de fora
                OR: [{ situacaoCA: null }, { situacaoCA: { not: 'CANCELADO' } }],
                AND: [{ OR: [{ dataVenda: { gte: desde } }, { createdAt: { gte: desde } }] }],
                itens: { some: { produtoId: produto.id } }
            },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true, numero: true, especial: true, bonificacao: true,
                itens: { where: { produtoId: produto.id }, select: { quantidade: true } }
            }
        });

        const movs = await prisma.movimentacaoEstoque.findMany({
            where: { produtoId: produto.id, pedidoId: { in: pedidos.map(p => p.id) } },
            select: { pedidoId: true, tipo: true, quantidade: true, motivo: true }
        });
        const MOTIVOS_BAIXA = ['FATURAMENTO', 'PEDIDO_ESPECIAL', 'PEDIDO_BONIFICACAO'];
        // AJUSTE_MANUAL entra como estorno AQUI porque os créditos de "baixa em dobro"
        // desta própria rota são gravados assim (com pedidoId — ajuste da tela não tem
        // pedidoId e nem passa neste filtro). Sem isso, rodar de novo creditaria em dobro.
        const MOTIVOS_ESTORNO = ['CANCELAMENTO_CA', 'CANCELAMENTO', 'EXCLUSAO', 'AJUSTE_MANUAL'];
        const saldoPorPedido = {};
        for (const mv of movs) {
            const q = parseFloat(mv.quantidade || 0);
            if (mv.tipo === 'SAIDA' && MOTIVOS_BAIXA.includes(mv.motivo)) {
                saldoPorPedido[mv.pedidoId] = (saldoPorPedido[mv.pedidoId] || 0) + q;
            } else if (mv.tipo === 'ENTRADA' && MOTIVOS_ESTORNO.includes(mv.motivo)) {
                saldoPorPedido[mv.pedidoId] = (saldoPorPedido[mv.pedidoId] || 0) - q;
            }
        }

        const correcoes = [];
        for (const pe of pedidos) {
            const qtdPedido = pe.itens.reduce((s, i) => s + parseFloat(i.quantidade || 0), 0);
            const baixado = saldoPorPedido[pe.id] || 0;
            const delta = qtdPedido - baixado;
            if (Math.abs(delta) < 0.001) continue;
            if (delta > 0) {
                correcoes.push({
                    pedidoId: pe.id, numero: pe.numero, tipo: 'SAIDA', quantidade: delta,
                    motivo: pe.bonificacao ? 'PEDIDO_BONIFICACAO' : (pe.especial ? 'PEDIDO_ESPECIAL' : 'FATURAMENTO'),
                    observacao: `Baixa retroativa pedido #${pe.numero || pe.id} — aprovado sem baixa de estoque (correção do bug, jul/2026)`
                });
            } else {
                correcoes.push({
                    pedidoId: pe.id, numero: pe.numero, tipo: 'ENTRADA', quantidade: -delta,
                    motivo: 'AJUSTE_MANUAL',
                    observacao: `Correção de baixa em dobro pedido #${pe.numero || pe.id} (bug corrigido, jul/2026)`
                });
            }
        }

        const totalSaidas = correcoes.filter(c => c.tipo === 'SAIDA').reduce((s, c) => s + c.quantidade, 0);
        const totalEntradas = correcoes.filter(c => c.tipo === 'ENTRADA').reduce((s, c) => s + c.quantidade, 0);
        const estoqueAtual = parseFloat(produto.estoqueTotal || 0);
        const projetado = estoqueAtual - totalSaidas + totalEntradas;

        if (!executar) {
            return res.json({
                simulacao: true, produto: produto.nome, desde,
                pedidosVerificados: pedidos.length, correcoes: correcoes.length,
                totalSaidasFaltantes: totalSaidas, totalCreditosDuplicidade: totalEntradas,
                estoqueAtual, estoqueProjetado: projetado, detalhes: correcoes
            });
        }

        // Execução: cada correção em transação própria (banco compartilhado lento);
        // se parar no meio, rodar de novo continua de onde parou (delta já corrigido vira 0).
        const aplicadas = [];
        for (const c of correcoes) {
            await prisma.$transaction(async (tx) => {
                const atual = await tx.produto.findUnique({
                    where: { id: produto.id },
                    select: { estoqueTotal: true }
                });
                const antes = parseFloat(atual?.estoqueTotal || 0);
                const depois = c.tipo === 'SAIDA' ? antes - c.quantidade : antes + c.quantidade;
                await tx.produto.update({ where: { id: produto.id }, data: { estoqueTotal: depois } });
                await tx.movimentacaoEstoque.create({
                    data: {
                        produtoId: produto.id,
                        pedidoId: c.pedidoId,
                        tipo: c.tipo,
                        quantidade: c.quantidade,
                        motivo: c.motivo,
                        observacao: c.observacao,
                        estoqueAntes: antes,
                        estoqueDepois: depois,
                        sincCA: false,
                        erroCA: null
                    }
                });
                aplicadas.push({ numero: c.numero, tipo: c.tipo, quantidade: c.quantidade, antes, depois });
            }, { timeout: 20000, maxWait: 10000 });
        }

        const recalc = await estoqueService.recalcularEstoqueProduto(produto.id);
        const produtoFinal = await prisma.produto.findUnique({
            where: { id: produto.id },
            select: { estoqueTotal: true, estoqueReservado: true, estoqueDisponivel: true }
        });

        res.json({
            executado: true, produto: produto.nome,
            correcoesAplicadas: aplicadas.length,
            totalSaidasFaltantes: totalSaidas, totalCreditosDuplicidade: totalEntradas,
            estoqueFinal: produtoFinal, recalc, detalhes: aplicadas
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/estoque-ajuste-batch — aplica ajustes manuais em lote
// Body: { ajustes: [{ nomeProduto, quantidade, tipo, observacao }] }
router.post('/estoque-ajuste-batch', async (req, res) => {
    const { ajustes } = req.body;
    if (!Array.isArray(ajustes) || ajustes.length === 0) {
        return res.status(400).json({ error: 'ajustes deve ser um array não vazio.' });
    }
    const resultados = [];
    const erros = [];

    for (const aj of ajustes) {
        try {
            const produto = await prisma.produto.findFirst({
                where: { nome: aj.nomeProduto },
                select: { id: true, nome: true }
            });
            if (!produto) {
                erros.push({ nomeProduto: aj.nomeProduto, erro: 'Produto não encontrado' });
                continue;
            }
            const qtd = parseFloat(aj.quantidade);
            if (!qtd || qtd <= 0) {
                erros.push({ nomeProduto: aj.nomeProduto, erro: 'Quantidade inválida' });
                continue;
            }
            const resultado = await estoqueService.ajustar({
                produtoId: produto.id,
                vendedorId: null,
                tipo: aj.tipo || 'ENTRADA',
                quantidade: qtd,
                motivo: 'AJUSTE_MANUAL',
                observacao: aj.observacao || 'Correção de estoque via admin'
            });
            resultados.push({ nomeProduto: produto.nome, tipo: aj.tipo || 'ENTRADA', quantidade: qtd, estoqueDepois: resultado.estoqueDepois });
        } catch (err) {
            erros.push({ nomeProduto: aj.nomeProduto, erro: err.message });
        }
    }

    return res.json({ ok: true, aplicados: resultados.length, erros: erros.length, resultados, erros });
});

// POST /api/admin-exec/import-etiquetas — upsert em lote de etiquetas (por codigoProduto)
router.post('/import-etiquetas', async (req, res) => {
    try {
        const { etiquetas, limparVazios } = req.body;

        if (limparVazios) {
            const del = await prisma.etiquetaProduto.deleteMany({
                where: { OR: [{ codigoProduto: '' }, { nomeProduto: '' }] }
            });
            if (!etiquetas?.length) return res.json({ ok: true, deletados: del.count });
        }

        // Pré-carrega produtos do catálogo para auto-vincular por código
        const todosProdutos = await prisma.produto.findMany({ select: { id: true, codigo: true } });
        if (!Array.isArray(etiquetas) || etiquetas.length === 0)
            return res.status(400).json({ error: 'Array etiquetas vazio.' });

        const criados = [], atualizados = [], erros = [];

        for (const et of etiquetas) {
            try {
                // Match por codigoProduto + pesoUnitario para não sobrescrever versões diferentes
                const existente = await prisma.etiquetaProduto.findFirst({
                    where: {
                        codigoProduto: String(et.codigoProduto),
                        pesoUnitario: parseInt(et.pesoUnitario) || 0,
                    }
                });
                // Auto-link: procura produto no catálogo, respeita unique constraint (produtoId)
                const produtoCat = todosProdutos.find(p => String(p.codigo).trim() === String(et.codigoProduto).trim());
                let produtoIdFinal = undefined;
                if (produtoCat?.id) {
                    const jaOcupado = await prisma.etiquetaProduto.findFirst({
                        where: { produtoId: produtoCat.id, id: { not: existente?.id ?? 'none' } }
                    });
                    if (!jaOcupado) produtoIdFinal = produtoCat.id;
                }
                const data = {
                    codigoProduto:         String(et.codigoProduto || ''),
                    nomeProduto:           String(et.nomeProduto || ''),
                    pesoUnitario:          parseInt(et.pesoUnitario) || 0,
                    pesoTabelaNutricional: parseInt(et.pesoTabelaNutricional) || 0,
                    valorEnergetico:       et.valorEnergetico   || null,
                    carboidratos:          et.carboidratos       || null,
                    acucaresTotais:        et.acucaresTotais      || null,
                    acucaresAdicionados:   et.acucaresAdicionados || null,
                    proteinas:             et.proteinas          || null,
                    gordurasTotais:        et.gordurasTotais     || null,
                    gordurasSaturadas:     et.gordurasSaturadas  || null,
                    gordurasTrans:         et.gordurasTrans      || null,
                    fibraAlimentar:        et.fibraAlimentar     || null,
                    sodio:                 et.sodio              || null,
                    produtoId:             produtoIdFinal,
                    quantidadeEmbalagem:   parseInt(et.quantidadeEmbalagem) || 1,
                    quantidadeAproximada:  Boolean(et.quantidadeAproximada),
                    composicao:            String(et.composicao  || ''),
                    modoPreparo:           String(et.modoPreparo || ''),
                    codigoBarras:          et.codigoBarras       || null,
                    contemLeite:           Boolean(et.contemLeite),
                    contemGluten:          Boolean(et.contemGluten),
                    contemLactose:         Boolean(et.contemLactose),
                    contemOvo:             Boolean(et.contemOvo),
                    alergenos:             Array.isArray(et.alergenos) ? et.alergenos.filter(Boolean) : [],
                    especieCrustaceos:     et.especieCrustaceos   || null,
                    especiePeixes:         et.especiePeixes        || null,
                    outrosAlergenos:       et.outrosAlergenos    || null,
                    avisosRotulo:          et.avisosRotulo        || null,
                    armazenamento:         et.armazenamento       || null,
                    validadeDias:          parseInt(et.validadeDias) || 90,
                    ativo:                 et.ativo !== false,
                    tipoProduto:           et.tipoProduto         || null,
                    tarjaPreta:            Boolean(et.tarjaPreta),
                };
                if (existente) {
                    await prisma.etiquetaProduto.update({ where: { id: existente.id }, data });
                    atualizados.push(et.codigoProduto);
                } else {
                    await prisma.etiquetaProduto.create({ data });
                    criados.push(et.codigoProduto);
                }
            } catch (e) {
                erros.push({ codigo: et.codigoProduto, erro: e.message });
            }
        }
        return res.json({ ok: true, criados: criados.length, atualizados: atualizados.length, erros, detalhe: { criados, atualizados } });
    } catch (err) {
        console.error('[import-etiquetas]', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/admin-exec/migrar-alergenos
// Converte os booleans antigos (contemLeite/contemOvo) para a lista alergenos[]
router.post('/migrar-alergenos', async (req, res) => {
    try {
        const todas = await prisma.etiquetaProduto.findMany({
            select: { id: true, nomeProduto: true, contemLeite: true, contemOvo: true, alergenos: true }
        });
        const atualizadas = [];
        for (const et of todas) {
            if (Array.isArray(et.alergenos) && et.alergenos.length > 0) continue; // já tem
            const lista = [];
            if (et.contemLeite) lista.push('Leite');
            if (et.contemOvo)   lista.push('Ovos');
            if (lista.length === 0) continue;
            await prisma.etiquetaProduto.update({ where: { id: et.id }, data: { alergenos: lista } });
            atualizadas.push({ nome: et.nomeProduto, alergenos: lista });
        }
        return res.json({ ok: true, atualizadas: atualizadas.length, detalhe: atualizadas });
    } catch (err) {
        console.error('[migrar-alergenos]', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/admin-exec/fix-km-combustivel — corrige km errado em abastecimento
// Body: { veiculoId, kmErrado, kmCorreto }
router.post('/fix-km-combustivel', async (req, res) => {
    try {
        const { veiculoId, kmErrado, kmCorreto } = req.body;
        if (!veiculoId || kmErrado === undefined) {
            return res.status(400).json({ error: 'veiculoId e kmErrado obrigatórios' });
        }
        const registros = await prisma.despesa.findMany({
            where: { veiculoId, categoria: 'COMBUSTIVEL', kmNoAbastecimento: Number(kmErrado) },
            select: { id: true, dataReferencia: true, kmNoAbastecimento: true, litros: true, valor: true }
        });
        if (registros.length === 0) {
            return res.json({ ok: false, mensagem: 'Nenhum registro encontrado com esse km.' });
        }
        if (kmCorreto === null || kmCorreto === undefined) {
            // Sem kmCorreto: apenas lista os registros encontrados
            return res.json({ ok: true, encontrados: registros.length, registros });
        }
        const atualizados = [];
        for (const r of registros) {
            await prisma.despesa.update({ where: { id: r.id }, data: { kmNoAbastecimento: Number(kmCorreto) } });
            atualizados.push(r.id);
        }
        res.json({ ok: true, corrigidos: atualizados.length, ids: atualizados });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/recalcular-flex-historico
// Recalcula flexGerado por item e flexTotal dos pedidos dos últimos 30 dias
// aplicando as regras atuais de categoria (flexPositivo, flexNegativo, contabilizaFlex, isentoFlex)
router.post('/recalcular-flex-historico', async (req, res) => {
    try {
        const diasParam = parseInt(req.query.dias) || 30;
        const apenasSimular = req.query.simular === 'true';

        const trintaDiasAtras = new Date();
        trintaDiasAtras.setDate(trintaDiasAtras.getDate() - diasParam);

        // Carrega regras de categorias CA
        const catEstoque = await prisma.categoriaEstoque.findMany({ select: { nome: true, contabilizaFlex: true } });
        const catEstoqueMap = new Map(catEstoque.map(c => [c.nome, c.contabilizaFlex]));

        // Carrega regras de categorias comerciais
        const catProduto = await prisma.categoriaProduto.findMany({ select: { id: true, flexPositivo: true, flexNegativo: true } });
        const catProdutoMap = new Map(catProduto.map(c => [c.id, { flexPositivo: c.flexPositivo, flexNegativo: c.flexNegativo }]));

        // Busca produtos com suas categorias
        const produtos = await prisma.produto.findMany({ select: { id: true, categoria: true, categoriaProdutoId: true } });
        const produtoMap = new Map(produtos.map(p => {
            const contabilizaFlex = p.categoria ? (catEstoqueMap.get(p.categoria) ?? true) : true;
            const catComercial = p.categoriaProdutoId ? catProdutoMap.get(p.categoriaProdutoId) : null;
            return [p.id, { contabilizaFlex, flexPositivo: catComercial?.flexPositivo ?? true, flexNegativo: catComercial?.flexNegativo ?? true }];
        }));

        // Busca pedidos do período
        const pedidos = await prisma.pedido.findMany({
            where: {
                createdAt: { gte: trintaDiasAtras },
                statusEnvio: { not: 'EXCLUIDO' }
            },
            include: {
                itens: { select: { id: true, produtoId: true, valor: true, valorBase: true, quantidade: true, flexGerado: true } },
                cliente: { select: { categoriaCliente: { select: { isentoFlex: true } } } }
            }
        });

        const resultados = [];
        let pedidosAlterados = 0;
        let itensAlterados = 0;

        for (const pedido of pedidos) {
            const isentoFlex = pedido.cliente?.categoriaCliente?.isentoFlex || false;
            let novoFlexTotal = 0;
            const itensParaAtualizar = [];

            for (const item of pedido.itens) {
                let novoFlexGerado;

                if (isentoFlex || pedido.bonificacao) {
                    novoFlexGerado = 0;
                } else {
                    const flexBruto = (Number(item.valor) - Number(item.valorBase)) * Number(item.quantidade);
                    const regra = produtoMap.get(item.produtoId);
                    if (!regra || !regra.contabilizaFlex) {
                        novoFlexGerado = 0;
                    } else if (flexBruto > 0 && !regra.flexPositivo) {
                        novoFlexGerado = 0;
                    } else if (flexBruto < 0 && !regra.flexNegativo) {
                        novoFlexGerado = 0;
                    } else {
                        novoFlexGerado = flexBruto;
                    }
                }

                novoFlexTotal += novoFlexGerado;

                const flexAtual = Number(item.flexGerado || 0);
                if (Math.abs(flexAtual - novoFlexGerado) > 0.001) {
                    itensParaAtualizar.push({ id: item.id, novoFlexGerado, flexAtual });
                }
            }

            const flexTotalAtual = Number(pedido.flexTotal || 0);
            const mudouTotal = Math.abs(flexTotalAtual - novoFlexTotal) > 0.001;
            const mudouItens = itensParaAtualizar.length > 0;

            if (mudouTotal || mudouItens) {
                pedidosAlterados++;
                itensAlterados += itensParaAtualizar.length;
                resultados.push({
                    pedidoId: pedido.id,
                    numero: pedido.numero,
                    especial: pedido.especial,
                    flexAntes: flexTotalAtual,
                    flexDepois: novoFlexTotal,
                    itensMudados: itensParaAtualizar.length
                });

                if (!apenasSimular) {
                    // Atualiza itens
                    for (const it of itensParaAtualizar) {
                        await prisma.pedidoItem.update({ where: { id: it.id }, data: { flexGerado: it.novoFlexGerado } });
                    }
                    // Atualiza flexTotal do pedido
                    await prisma.pedido.update({ where: { id: pedido.id }, data: { flexTotal: novoFlexTotal } });
                }
            }
        }

        res.json({
            ok: true,
            simulacao: apenasSimular,
            diasConsiderados: diasParam,
            totalPedidos: pedidos.length,
            pedidosAlterados,
            itensAlterados,
            detalhes: resultados
        });
    } catch (e) {
        console.error('[admin-exec] recalcular-flex-historico:', e);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/autolink-etiquetas-ean
// Vincula etiquetas sem produtoId procurando produto pelo EAN (codigoBarras == produto.ean)
router.post('/autolink-etiquetas-ean', async (req, res) => {
    try {
        const etiquetasSemLink = await prisma.etiquetaProduto.findMany({
            where: { produtoId: null },
            select: { id: true, codigoBarras: true, codigoProduto: true, nomeProduto: true }
        });

        const vinculadas = [], semMatch = [], erros = [];

        for (const et of etiquetasSemLink) {
            if (!et.codigoBarras) { semMatch.push(et.codigoProduto); continue; }
            try {
                const produto = await prisma.produto.findFirst({
                    where: { ean: et.codigoBarras },
                    select: { id: true, codigo: true, nome: true }
                });
                if (!produto) { semMatch.push(`${et.codigoProduto} (EAN ${et.codigoBarras})`); continue; }

                await prisma.etiquetaProduto.update({
                    where: { id: et.id },
                    data: { produtoId: produto.id }
                });
                vinculadas.push({ etiqueta: et.nomeProduto, produto: produto.nome, sku: produto.codigo });
            } catch (e) {
                erros.push({ codigo: et.codigoProduto, erro: e.message });
            }
        }

        return res.json({ ok: true, vinculadas: vinculadas.length, semMatch: semMatch.length, erros: erros.length, detalhe: { vinculadas, semMatch, erros } });
    } catch (err) {
        console.error('[autolink-etiquetas-ean]', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/admin-exec/sync-itempcp-nomes
// Corrige nomes defasados: faz o nome de cada ItemPcp (usado nas receitas)
// espelhar o nome atual do Produto vinculado. Idempotente.
router.post('/sync-itempcp-nomes', async (req, res) => {
    try {
        const itens = await prisma.itemPcp.findMany({
            where: { produtoId: { not: null } },
            select: { id: true, nome: true, produto: { select: { nome: true } } }
        });
        const corrigidos = [];
        for (const it of itens) {
            const nomeProduto = it.produto?.nome;
            if (nomeProduto && nomeProduto !== it.nome) {
                await prisma.itemPcp.update({ where: { id: it.id }, data: { nome: nomeProduto } });
                corrigidos.push({ de: it.nome, para: nomeProduto });
            }
        }
        return res.json({ ok: true, verificados: itens.length, corrigidos: corrigidos.length, detalhe: corrigidos });
    } catch (err) {
        console.error('[sync-itempcp-nomes]', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/admin-exec/dfe-status
// Diagnóstico da captura de NF-e (SEFAZ DF-e): controle de NSU, contagens por
// status e as 5 notas mais recentes.
router.get('/dfe-status', async (req, res) => {
    try {
        const sefazDfeService = require('../services/sefazDfeService');
        const [controle, ativa, porStatus, recentes] = await Promise.all([
            prisma.dfeControle.findUnique({ where: { id: 'dfe' } }),
            sefazDfeService.capturaAtiva(),
            prisma.notaEntrada.groupBy({ by: ['status'], _count: { _all: true } }),
            prisma.notaEntrada.findMany({
                orderBy: { criadoEm: 'desc' },
                take: 5,
                select: {
                    id: true, chave: true, numero: true, fornecedorNome: true,
                    emissao: true, valorTotal: true, status: true, manifestada: true, criadoEm: true
                }
            })
        ]);
        res.json({
            ok: true,
            capturaAtiva: ativa,
            controle,
            contagens: Object.fromEntries(porStatus.map((s) => [s.status, s._count._all])),
            notasRecentes: recentes
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/dfe-consultar
// Força um ciclo de captura de NF-e agora. Resposta síncrona resumida
// (timeout de 60s — se estourar, o ciclo continua em background).
router.post('/dfe-consultar', async (req, res) => {
    try {
        const sefazDfeService = require('../services/sefazDfeService');
        const timeout = new Promise((resolve) => setTimeout(
            () => resolve({ ok: true, timeout: true, motivo: 'Ciclo ainda em execução após 60s — segue em background (veja /dfe-status).' }),
            60000
        ));
        const resultado = await Promise.race([sefazDfeService.executarCiclo(), timeout]);
        res.json(resultado);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/contas-pagar-status
// Diagnóstico do envio de Contas a Pagar → Conta Azul: contagens por status de
// envio, fornecedores pendentes/erro e as contas mais recentes com o motivo do erro.
router.get('/contas-pagar-status', async (req, res) => {
    try {
        const [porStatusConta, porStatusForn, contas, fornPend] = await Promise.all([
            prisma.contaPagar.groupBy({ by: ['statusEnvioCA'], _count: { _all: true } }),
            prisma.fornecedor.groupBy({ by: ['statusEnvioCA'], _count: { _all: true } }),
            prisma.contaPagar.findMany({
                orderBy: { criadoEm: 'desc' },
                take: 10,
                select: {
                    id: true, descricao: true, valorTotal: true, origem: true,
                    statusEnvioCA: true, erroEnvioCA: true, idEventoCA: true, protocoloCA: true,
                    criadoEm: true,
                    fornecedor: { select: { razaoSocial: true, contaAzulId: true, statusEnvioCA: true, erroEnvioCA: true } }
                }
            }),
            prisma.fornecedor.findMany({
                where: { statusEnvioCA: { in: ['ENVIAR', 'ENVIANDO', 'ERRO'] } },
                take: 10,
                select: { id: true, razaoSocial: true, cnpjCpf: true, statusEnvioCA: true, erroEnvioCA: true, contaAzulId: true }
            })
        ]);
        const caConfig = await prisma.contaAzulConfig.findFirst({ select: { id: true, updatedAt: true } }).catch(() => null);
        res.json({
            ok: true,
            caConectada: !!caConfig,
            contasPorStatusEnvio: Object.fromEntries(porStatusConta.map((s) => [s.statusEnvioCA, s._count._all])),
            fornecedoresPorStatusEnvio: Object.fromEntries(porStatusForn.map((s) => [s.statusEnvioCA, s._count._all])),
            fornecedoresPendentes: fornPend,
            contasRecentes: contas
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/contas-pagar-reenviar
// Re-enfileira para o CA todas as Contas a Pagar que ficaram em ERRO
// (equivale ao botão "reenviar" da tela, em lote). Diagnóstico/manutenção.
router.post('/contas-pagar-reenviar', async (req, res) => {
    try {
        const r = await prisma.contaPagar.updateMany({
            where: { statusEnvioCA: 'ERRO' },
            data: { statusEnvioCA: 'ENVIAR', erroEnvioCA: null }
        });
        res.json({ ok: true, reenfileiradas: r.count });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/contas-pagar-reconciliar
// Conserta contas que ficaram em ERRO mas cujo erro menciona "protocolo" (indício de que o CA
// aceitou/criou o evento apesar do erro). Para cada uma, tenta localizar o evento no CA pelo
// codigo_referencia (id da conta). Se achar → adota (idEventoCA + mapeia parcelas + ENVIADO),
// SEM duplicar. Se não achar com segurança, deixa como está e reporta.
// Recupera casos como a despesa da "BERNADETE" (existe no CA, ERRO no app).
router.post('/contas-pagar-reconciliar', async (req, res) => {
    try {
        const caSync = require('../services/contasPagarCaSyncService');
        const caConfig = await prisma.contaAzulConfig.findFirst().catch(() => null);
        if (!caConfig) return res.status(400).json({ ok: false, error: 'Conta Azul não conectada (sem token).' });

        const candidatas = await prisma.contaPagar.findMany({
            where: {
                statusEnvioCA: 'ERRO',
                erroEnvioCA: { contains: 'protocolo', mode: 'insensitive' }
            },
            include: { fornecedor: true, parcelas: true },
            orderBy: { criadoEm: 'asc' },
            take: 100
        });

        let reconciliadas = 0;
        const detalhes = [];
        for (const conta of candidatas) {
            try {
                const eventoId = await caSync._encontrarEventoPorReferencia(conta.id, conta);
                if (eventoId) {
                    await prisma.contaPagar.update({
                        where: { id: conta.id },
                        data: { idEventoCA: eventoId, erroEnvioCA: null }
                    });
                    await caSync._mapearParcelasCA(conta.id, eventoId); // fecha em ENVIADO ao casar as parcelas
                    reconciliadas++;
                    detalhes.push({ id: conta.id, descricao: conta.descricao, resultado: 'RECONCILIADA', eventoId });
                } else {
                    detalhes.push({ id: conta.id, descricao: conta.descricao, resultado: 'NAO_ENCONTRADA' });
                }
            } catch (err) {
                detalhes.push({ id: conta.id, descricao: conta.descricao, resultado: 'ERRO_BUSCA', erro: err.message });
            }
        }

        res.json({ ok: true, verificadas: candidatas.length, reconciliadas, detalhes });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/diag-extrato-conciliado?contaId=&limite=20
// Confere o que a conciliação bancária fez: cada lançamento CONCILIADO com a baixa a que
// ficou preso (valor do extrato × valor da baixa, incluindo juros/multa) e se a baixa foi
// ao CA. Serve para auditar as conciliações de teste — conciliar NÃO dá baixa em nada,
// então aqui a gente confirma que os dois lados batem de verdade.
router.get('/diag-extrato-conciliado', async (req, res) => {
    try {
        const where = { status: 'CONCILIADO' };
        if (req.query.contaId) where.contaFinanceiraCaId = String(req.query.contaId);
        const linhas = await prisma.extratoLancamento.findMany({
            where,
            orderBy: { conciliadoEm: 'desc' },
            take: Math.min(Number(req.query.limite) || 20, 100)
        });

        const n = (v) => Number(v || 0);
        const saida = [];
        for (const l of linhas) {
            const base = {
                data: l.data.toISOString().slice(0, 10),
                descricao: l.descricao,
                beneficiarioNoBanco: l.nome || l.payee || null,
                documento: l.checkNum || l.refNum || null,
                tipo: l.tipo,
                valorExtrato: n(l.valor),
                auto: l.conciliadoAuto,
                conciliadoEm: l.conciliadoEm
            };
            if (l.pagamentoParcelaPagarId) {
                const p = await prisma.pagamentoParcelaPagar.findUnique({
                    where: { id: l.pagamentoParcelaPagarId },
                    include: { parcelaPagar: { include: { contaPagar: { include: { fornecedor: true } } } } }
                });
                const totalBaixa = p ? n(p.valorPago) + n(p.juros) + n(p.multa) : 0;
                saida.push({
                    ...base,
                    baixa: p ? {
                        despesa: p.parcelaPagar?.contaPagar?.descricao,
                        fornecedor: p.parcelaPagar?.contaPagar?.fornecedor?.razaoSocial || null,
                        valorPago: n(p.valorPago), juros: n(p.juros), multa: n(p.multa), total: totalBaixa,
                        dataPagamento: p.dataPagamento?.toISOString().slice(0, 10),
                        statusEnvioCA: p.statusEnvioCA,
                        origem: p.origem,
                        estornado: p.estornado
                    } : null,
                    confere: p ? Math.abs(totalBaixa - n(l.valor)) <= 0.01 : false
                });
            } else if (l.pagamentoParcelaId) {
                const p = await prisma.pagamentoParcela.findUnique({
                    where: { id: l.pagamentoParcelaId },
                    include: { parcela: { include: { contaReceber: { include: { cliente: true } } } } }
                });
                saida.push({
                    ...base,
                    baixa: p ? {
                        cliente: p.parcela?.contaReceber?.cliente?.Nome || null,
                        valorRecebido: n(p.valorRecebido),
                        dataPagamento: p.dataPagamento?.toISOString().slice(0, 10),
                        estornado: p.estornado
                    } : null,
                    confere: p ? Math.abs(n(p.valorRecebido) - n(l.valor)) <= 0.01 : false
                });
            } else {
                saida.push({ ...base, baixa: 'GRUPO (N↔M)', confere: null });
            }
        }
        res.json({
            total: saida.length,
            divergentes: saida.filter((s) => s.confere === false).length,
            lancamentos: saida
        });
    } catch (error) {
        console.error('Erro no diag da conciliação bancária:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin-exec/contas-pagar-conciliacao-suspeitas
// Varre vínculos suspeitos com o CA (incidente do ICMS DESTDA, 07/2026):
//  (a) parcelas com baixa vinda do CA cujo total pago EXCEDE o valor da parcela
//      (indício de parcela mapeada no evento errado — a baixa era de outro título);
//  (b) contas vinculadas a evento do CA cuja "nota" é texto livre (não numérica) —
//      grupo de risco da conciliação antiga, que casava por texto sem conferir valor.
router.get('/contas-pagar-conciliacao-suspeitas', async (req, res) => {
    try {
        const parcelas = await prisma.parcelaPagar.findMany({
            where: { idParcelaCA: { not: null }, pagamentos: { some: { origem: 'CA', estornado: false } } },
            include: {
                pagamentos: { where: { estornado: false } },
                contaPagar: {
                    select: {
                        id: true, descricao: true, numeroNota: true, idEventoCA: true, statusEnvioCA: true,
                        fornecedor: { select: { razaoSocial: true } }
                    }
                }
            }
        });
        const baixasDivergentes = [];
        for (const p of parcelas) {
            const pago = p.pagamentos.reduce((s, x) => s + Number(x.valorPago), 0);
            const desconto = p.pagamentos.reduce((s, x) => s + Number(x.desconto || 0), 0);
            if (pago > Number(p.valor) - desconto + 0.02) {
                baixasDivergentes.push({
                    contaId: p.contaPagar.id,
                    descricao: p.contaPagar.descricao,
                    fornecedor: p.contaPagar.fornecedor?.razaoSocial || null,
                    numeroNota: p.contaPagar.numeroNota,
                    idEventoCA: p.contaPagar.idEventoCA,
                    parcelaId: p.id, numeroParcela: p.numeroParcela, status: p.status,
                    vencimento: p.dataVencimento,
                    valorParcela: Number(p.valor),
                    totalPago: Math.round(pago * 100) / 100
                });
            }
        }
        const comEventoENota = await prisma.contaPagar.findMany({
            where: { idEventoCA: { not: null }, numeroNota: { not: null } },
            select: { id: true, descricao: true, numeroNota: true, idEventoCA: true, valorTotal: true, statusEnvioCA: true }
        });
        const notaTextoLivre = comEventoENota.filter(
            (c) => !/^\d{3,}([-/.]\d{1,4})?$/.test(String(c.numeroNota).trim())
        );
        res.json({ ok: true, baixasDivergentes, contasNotaTextoLivreComEvento: notaTextoLivre });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/contas-pagar-desvincular/:contaId?reenviar=1
// Desfaz um vínculo ERRADO com o CA: apaga as baixas importadas do CA (origem 'CA') das
// parcelas da conta, zera idParcelaCA/baixadoViaCA/idEventoCA/protocoloCA, recalcula os
// status e (com ?reenviar=1) re-enfileira o envio para criar a despesa certa no CA.
// NÃO mexe em baixas registradas no app (origem != 'CA').
router.post('/contas-pagar-desvincular/:contaId', async (req, res) => {
    try {
        const caSync = require('../services/contasPagarCaSyncService');
        const { contaId } = req.params;
        const reenviar = String(req.query.reenviar || '') === '1';
        const conta = await prisma.contaPagar.findUnique({
            where: { id: contaId },
            include: { parcelas: true }
        });
        if (!conta) return res.status(404).json({ ok: false, error: 'Conta não encontrada.' });

        const resumo = { contaId, descricao: conta.descricao, baixasApagadas: 0, parcelasDesvinculadas: 0 };
        await prisma.$transaction(async (tx) => {
            for (const p of conta.parcelas) {
                const r = await tx.pagamentoParcelaPagar.deleteMany({
                    where: { parcelaPagarId: p.id, origem: 'CA' }
                });
                resumo.baixasApagadas += r.count;
                if (p.idParcelaCA || p.baixadoViaCA) {
                    await tx.parcelaPagar.update({
                        where: { id: p.id },
                        data: { idParcelaCA: null, baixadoViaCA: false }
                    });
                    resumo.parcelasDesvinculadas++;
                }
            }
            await tx.contaPagar.update({
                where: { id: contaId },
                data: {
                    idEventoCA: null,
                    protocoloCA: null,
                    ...(reenviar ? { statusEnvioCA: 'ENVIAR', erroEnvioCA: null } : {})
                }
            });
        }, { timeout: 20000, maxWait: 10000 });

        // Recalcula status fora da transação (cada recálculo é idempotente e isolado)
        for (const p of conta.parcelas) {
            await caSync.recalcularParcelaEConta(prisma, p.id);
        }
        const depois = await prisma.contaPagar.findUnique({
            where: { id: contaId },
            select: {
                status: true, statusEnvioCA: true, idEventoCA: true,
                parcelas: { select: { numeroParcela: true, status: true, valorPago: true, idParcelaCA: true } }
            }
        });
        res.json({ ok: true, ...resumo, reenviar, depois });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── Financeiro POR CONTA (banco/caixa) — diagnóstico e backfill ──

// GET /api/admin-exec/financeiro-contas-diag — quanto de cada lado já tem a conta financeira preenchida
router.get('/financeiro-contas-diag', async (req, res) => {
    try {
        const [contasFin, pagTotal, pagSemConta, recPagas, recSemConta] = await Promise.all([
            prisma.contaFinanceira.count(),
            prisma.pagamentoParcelaPagar.count({ where: { estornado: false } }),
            prisma.pagamentoParcelaPagar.count({ where: { estornado: false, contaFinanceiraCaId: null } }),
            prisma.parcela.count({ where: { status: 'PAGO' } }),
            prisma.parcela.count({ where: { status: 'PAGO', contaFinanceiraCaId: null } })
        ]);
        const bancos = await prisma.contaFinanceira.findMany({ select: { id: true, nomeBanco: true, tipoUso: true, ativo: true }, orderBy: { nomeBanco: 'asc' } });
        res.json({
            ok: true,
            contasFinanceirasCadastradas: contasFin,
            pagar: { totalBaixas: pagTotal, semConta: pagSemConta, comConta: pagTotal - pagSemConta },
            receber: { totalPagas: recPagas, semConta: recSemConta, comConta: recPagas - recSemConta },
            backfillReceber: _backfillReceber,
            bancos
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/contas-financeiras-sync — puxa a lista de bancos/caixas do CA para a tabela local
router.post('/contas-financeiras-sync', async (req, res) => {
    try {
        const caSync = require('../services/contasPagarCaSyncService');
        const r = await caSync.sincronizarContasFinanceiras();
        res.json(r);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/backfill-conta-pagar?limite=300 — preenche o banco nas baixas antigas de contas a PAGAR
router.post('/backfill-conta-pagar', async (req, res) => {
    try {
        const caSync = require('../services/contasPagarCaSyncService');
        const limite = Math.min(1000, Math.max(1, parseInt(req.query.limite, 10) || 300));
        const r = await caSync.backfillContasFinanceirasPagar(limite);
        res.json(r);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/backfill-conta-receber?limite=40 — re-sincroniza do CA as contas a RECEBER
// pagas que estão sem banco, para preencher contaFinanceiraCaId. Limitado (cada conta bate no CA).
router.post('/backfill-conta-receber', async (req, res) => {
    try {
        const receberSync = require('../services/contasReceberSyncService');
        const caConfig = await prisma.contaAzulConfig.findFirst().catch(() => null);
        if (!caConfig) return res.status(400).json({ ok: false, error: 'Conta Azul não conectada (sem token).' });

        // Modo assíncrono (?async=1): dispara o processamento no servidor e responde na hora,
        // varrendo TODAS as contas em segundo plano (evita timeout do proxy em lotes grandes).
        // Acompanhe pela rota financeiro-contas-diag (receber.semConta cai até zerar).
        if (req.query.async === '1' || req.query.async === 'true') {
            if (_backfillReceber.rodando) {
                return res.json({ ok: true, jaRodando: true, progresso: _backfillReceber.progresso });
            }
            _backfillReceber.rodando = true;
            _backfillReceber.progresso = { processadas: 0, erros: 0, iniciadoEm: new Date().toISOString() };
            (async () => {
                try {
                    // eslint-disable-next-line no-constant-condition
                    while (true) {
                        const parcelas = await prisma.parcela.findMany({
                            where: { status: 'PAGO', contaFinanceiraCaId: null, contaReceber: { pedido: { idVendaContaAzul: { not: null }, especial: false } } },
                            select: { contaReceberId: true },
                            take: 400
                        });
                        const ids = [...new Set(parcelas.map((p) => p.contaReceberId))];
                        if (ids.length === 0) break;
                        let algumPreenchido = false;
                        for (const contaId of ids) {
                            try {
                                await receberSync.sincronizarConta(contaId, { semLog: true });
                                const cheias = await prisma.parcela.count({ where: { contaReceberId: contaId, status: 'PAGO', contaFinanceiraCaId: { not: null } } });
                                if (cheias > 0) algumPreenchido = true;
                                _backfillReceber.progresso.processadas++;
                            } catch (err) {
                                _backfillReceber.progresso.erros++;
                            }
                        }
                        // Se uma varredura inteira não preencheu nada, o restante não tem banco no CA — para.
                        if (!algumPreenchido) break;
                    }
                    console.log('[admin-exec] Backfill receber (async) concluído:', _backfillReceber.progresso);
                } catch (e) {
                    console.error('[admin-exec] Backfill receber (async) erro:', e.message);
                } finally {
                    _backfillReceber.rodando = false;
                }
            })();
            return res.json({ ok: true, iniciado: true, aviso: 'Rodando em segundo plano; acompanhe em financeiro-contas-diag.' });
        }

        const limite = Math.min(50, Math.max(1, parseInt(req.query.limite, 10) || 40));
        // Contas com alguma parcela PAGA sem banco, cujo pedido já tem espelho no CA
        const parcelas = await prisma.parcela.findMany({
            where: { status: 'PAGO', contaFinanceiraCaId: null, contaReceber: { pedido: { idVendaContaAzul: { not: null }, especial: false } } },
            select: { contaReceberId: true },
            take: limite * 8
        });
        const contaIds = [...new Set(parcelas.map((p) => p.contaReceberId))].slice(0, limite);

        let reSincronizadas = 0, preenchidas = 0;
        const detalhes = [];
        for (const contaId of contaIds) {
            try {
                await receberSync.sincronizarConta(contaId, { semLog: true });
                reSincronizadas++;
                const restam = await prisma.parcela.count({ where: { contaReceberId: contaId, status: 'PAGO', contaFinanceiraCaId: null } });
                const cheias = await prisma.parcela.count({ where: { contaReceberId: contaId, status: 'PAGO', contaFinanceiraCaId: { not: null } } });
                if (cheias > 0) preenchidas++;
                detalhes.push({ contaId, restamSemConta: restam, comConta: cheias });
            } catch (err) {
                detalhes.push({ contaId, erro: err.message });
            }
        }
        res.json({ ok: true, contasAlvo: contaIds.length, reSincronizadas, comAlgumBanco: preenchidas, detalhes });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/backfill-ledger-receber?limite=40  (ou ?async=1)
// Re-sincroniza do CA as contas a RECEBER pagas cujas parcelas NÃO têm ledger individual
// (baixas antigas, feitas antes do ledger existir). O sync (soLedger) cria uma linha de
// PagamentoParcela por baixa do CA, com o banco de cada uma — assim a divisão por conta
// (ex.: PIX Asaas + dinheiro Caixinha) passa a existir no app e a conciliação/saldo a
// enxergam. NÃO mexe em status/valor da parcela. Cada conta bate no CA → capado/async.
router.post('/backfill-ledger-receber', async (req, res) => {
    try {
        const receberSync = require('../services/contasReceberSyncService');
        const caConfig = await prisma.contaAzulConfig.findFirst().catch(() => null);
        if (!caConfig) return res.status(400).json({ ok: false, error: 'Conta Azul não conectada (sem token).' });

        // Parcelas PAGAS, com pedido espelhado no CA, e SEM nenhum pagamento ativo no ledger.
        const whereParcela = {
            status: 'PAGO',
            contaReceber: { pedido: { idVendaContaAzul: { not: null }, especial: false } },
            pagamentos: { none: { estornado: false } }
        };

        if (req.query.async === '1' || req.query.async === 'true') {
            if (_backfillLedger.rodando) return res.json({ ok: true, jaRodando: true, progresso: _backfillLedger.progresso });
            _backfillLedger.rodando = true;
            _backfillLedger.progresso = { processadas: 0, comLedger: 0, erros: 0, iniciadoEm: new Date().toISOString() };
            (async () => {
                try {
                    // eslint-disable-next-line no-constant-condition
                    while (true) {
                        const parcelas = await prisma.parcela.findMany({ where: whereParcela, select: { contaReceberId: true }, take: 400 });
                        const ids = [...new Set(parcelas.map((p) => p.contaReceberId))];
                        if (ids.length === 0) break;
                        let algum = false;
                        for (const contaId of ids) {
                            try {
                                await receberSync.sincronizarConta(contaId, { semLog: true, origem: 'BACKFILL_LEDGER' });
                                const comLedger = await prisma.pagamentoParcela.count({ where: { parcela: { contaReceberId: contaId }, estornado: false } });
                                if (comLedger > 0) { algum = true; _backfillLedger.progresso.comLedger++; }
                                _backfillLedger.progresso.processadas++;
                            } catch (err) { _backfillLedger.progresso.erros++; }
                        }
                        if (!algum) break; // varredura inteira sem criar ledger → o resto não tem baixa no CA
                    }
                    console.log('[admin-exec] Backfill ledger (async) concluído:', _backfillLedger.progresso);
                } catch (e) {
                    console.error('[admin-exec] Backfill ledger (async) erro:', e.message);
                } finally {
                    _backfillLedger.rodando = false;
                }
            })();
            return res.json({ ok: true, iniciado: true, aviso: 'Rodando em segundo plano; reconsulte esta rota (GET financeiro-contas-diag) para acompanhar.' });
        }

        const limite = Math.min(50, Math.max(1, parseInt(req.query.limite, 10) || 40));
        const parcelas = await prisma.parcela.findMany({ where: whereParcela, select: { contaReceberId: true }, take: limite * 8 });
        const contaIds = [...new Set(parcelas.map((p) => p.contaReceberId))].slice(0, limite);

        let reSincronizadas = 0, comLedger = 0;
        const detalhes = [];
        for (const contaId of contaIds) {
            try {
                await receberSync.sincronizarConta(contaId, { semLog: true, origem: 'BACKFILL_LEDGER' });
                reSincronizadas++;
                const n = await prisma.pagamentoParcela.count({ where: { parcela: { contaReceberId: contaId }, estornado: false } });
                if (n > 0) comLedger++;
                detalhes.push({ contaId, linhasLedger: n });
            } catch (err) {
                detalhes.push({ contaId, erro: err.message });
            }
        }
        res.json({ ok: true, progresso: _backfillLedger.progresso, contasAlvo: contaIds.length, reSincronizadas, comLedger, detalhes });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/sync-ledger-pedido/:numero — re-sincroniza UM pedido do CA.
// Cria o ledger dividido por conta (soLedger) se a parcela estiver paga sem ledger —
// para consertar um caso pontual (ex.: R$ 10 do PIX Asaas do pedido 2033). Read/write
// de uma conta só. Devolve o ledger antes/depois para conferência.
router.post('/sync-ledger-pedido/:numero', async (req, res) => {
    try {
        const receberSync = require('../services/contasReceberSyncService');
        const numero = parseInt(req.params.numero, 10);
        if (!numero) return res.status(400).json({ error: 'Informe o número do pedido.' });
        const caConfig = await prisma.contaAzulConfig.findFirst().catch(() => null);
        if (!caConfig) return res.status(400).json({ ok: false, error: 'Conta Azul não conectada (sem token).' });

        const pedido = await prisma.pedido.findFirst({ where: { numero }, select: { id: true } });
        if (!pedido) return res.status(404).json({ ok: false, error: `Pedido ${numero} não encontrado.` });
        const conta = await prisma.contaReceber.findFirst({ where: { pedidoId: pedido.id }, select: { id: true } });
        if (!conta) return res.status(404).json({ ok: false, error: `Pedido ${numero} sem conta a receber.` });

        const antes = await prisma.pagamentoParcela.count({ where: { parcela: { contaReceberId: conta.id }, estornado: false } });
        let r = null;
        try { r = await receberSync.sincronizarConta(conta.id, { semLog: true, origem: 'FIX_LEDGER' }); }
        catch (syncErr) { r = { erro: syncErr.message }; }

        // ?fallbackLocal=1 — o CA não devolveu as baixas (venda antiga/sem referência):
        // espelha o ledger dos DADOS DA PRÓPRIA parcela (valorPago/conta/data já corretos).
        // Só age em parcela PAGA e sem nenhum pagamento ativo (idempotente).
        if (req.query.fallbackLocal === '1') {
            const pagas = await prisma.parcela.findMany({
                where: { contaReceberId: conta.id, status: 'PAGO', pagamentos: { none: { estornado: false } } },
                select: { id: true, valorPago: true, contaFinanceiraCaId: true, dataPagamento: true, formaPagamento: true, baixadoPorId: true }
            });
            for (const p of pagas) {
                if (!(Number(p.valorPago) > 0) || !p.baixadoPorId) continue;
                await prisma.pagamentoParcela.create({
                    data: {
                        parcelaId: p.id,
                        valorRecebido: p.valorPago,
                        contaFinanceiraCaId: p.contaFinanceiraCaId,
                        dataPagamento: p.dataPagamento || new Date(),
                        formaPagamento: p.formaPagamento || null,
                        observacao: 'Ledger criado a partir da própria parcela (CA sem baixas para espelhar) [fix admin]',
                        registradoPorId: p.baixadoPorId
                    }
                });
            }
        }

        const ledger = await prisma.pagamentoParcela.findMany({
            where: { parcela: { contaReceberId: conta.id }, estornado: false },
            select: { valorRecebido: true, formaPagamento: true, contaFinanceiraCaId: true, dataPagamento: true }
        });
        const nomes = await prisma.contaFinanceira.findMany({ select: { id: true, nomeBanco: true } });
        const nome = (id) => nomes.find((c) => c.id === id)?.nomeBanco || (id ? '(não cadastrada)' : '(sem conta)');
        res.json({
            ok: true, pedido: numero,
            ledgerAntes: antes, ledgerDepois: ledger.length, aplicadas: r?.aplicadas ?? null,
            ledger: ledger.map((l) => ({ valor: Number(l.valorRecebido), forma: l.formaPagamento, conta: nome(l.contaFinanceiraCaId) }))
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/diag-pdf-extrato — SOMENTE LEITURA, autocontido.
// Gera em memória um PDF sintético no layout do extrato do Conta Azul e roda o
// parsePdfExtratoCA NESTE servidor — prova se a leitura de PDF funciona em produção
// (dependência instalada, Node compatível) sem precisar subir arquivo.
router.get('/diag-pdf-extrato', async (req, res) => {
    try {
        const { PDFDocument, StandardFonts } = require('pdf-lib');
        const conciliacaoService = require('../services/conciliacaoBancariaService');
        const pdf = await PDFDocument.create();
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        const page = pdf.addPage([842, 595]);
        const draw = (x, y, t) => page.drawText(t, { x, y, size: 9, font });
        let y = 540;
        const linha = (data, desc, status, valor) => { draw(40, y, data); draw(120, y, desc); draw(480, y, status); draw(640, y, valor); y -= 22; };
        draw(40, y, '01/07/2026'); draw(120, y, 'Saldo do dia'); draw(700, y, 'R$ 31.878,76'); y -= 22;
        linha('01/07/2026', 'Recebimento de cobranca - Venda 1593 - 1/1', 'Conciliado', 'R$ 361,07');
        linha('01/07/2026', 'Pagamento de Boleto para Nome nao encontrado', 'Conciliado', '- R$ 416,94');
        const bytes = await pdf.save();
        const r = await conciliacaoService.parsePdfExtratoCA(Buffer.from(bytes));
        res.json({
            ok: true,
            lancamentos: r.lancamentos.length,
            avisos: r.avisos,
            amostra: r.lancamentos.map((l) => ({ data: l.data, tipo: l.tipo, valor: l.valor, descricao: l.descricao }))
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message, stack: (e.stack || '').split('\n').slice(0, 4) });
    }
});

// GET /api/admin-exec/diag-ledger-receber?contaId=UUID&de=2026-07-01&ate=2026-07-31
// SOMENTE LEITURA. Para a conciliação: quantas parcelas PAGAS no período têm (ou não)
// o ledger individual (PagamentoParcela) — sem ledger, o crédito do extrato não acha par.
router.get('/diag-ledger-receber', async (req, res) => {
    try {
        const contaId = String(req.query.contaId || '').trim() || null;
        const de = new Date(`${req.query.de || '2026-07-01'}T00:00:00-03:00`);
        const ate = new Date(`${req.query.ate || '2026-07-31'}T23:59:59-03:00`);

        const pagas = await prisma.parcela.findMany({
            where: {
                status: 'PAGO',
                dataPagamento: { gte: de, lte: ate },
                ...(contaId ? { contaFinanceiraCaId: contaId } : {})
            },
            select: {
                id: true, valorPago: true, dataPagamento: true, contaFinanceiraCaId: true,
                pagamentos: { where: { estornado: false }, select: { id: true } },
                contaReceber: { select: { pedido: { select: { numero: true, nfeNumero: true } } } }
            }
        });
        const semLedger = pagas.filter((p) => p.pagamentos.length === 0);
        const comLedger = pagas.length - semLedger.length;
        res.json({
            ok: true,
            filtro: { contaId, de: req.query.de || '2026-07-01', ate: req.query.ate || '2026-07-31' },
            parcelasPagasNoPeriodo: pagas.length,
            comLedger,
            semLedger: semLedger.length,
            amostraSemLedger: semLedger.slice(0, 15).map((p) => ({
                pedido: p.contaReceber?.pedido?.numero || null,
                nfe: p.contaReceber?.pedido?.nfeNumero || null,
                valorPago: Number(p.valorPago || 0),
                dataPagamento: p.dataPagamento
            }))
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/diag-pdf-ultimo — SOMENTE LEITURA. Mostra as linhas de texto
// que o servidor extraiu do ÚLTIMO PDF de extrato cuja leitura falhou (0 lançamentos)
// — gravadas pelo parsePdfExtratoCA em app_configs.diag_pdf_extrato_ultimo.
router.get('/diag-pdf-ultimo', async (req, res) => {
    try {
        const cfg = await prisma.appConfig.findUnique({ where: { key: 'diag_pdf_extrato_ultimo' } });
        if (!cfg) return res.json({ ok: false, motivo: 'Nenhum diagnóstico gravado ainda (nenhuma importação de PDF falhou desde o deploy).' });
        res.json({ ok: true, ...cfg.value });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/diag-baixas-sem-banco?de=2026-06-01&ate=2026-07-31 — SOMENTE LEITURA.
// Por que o backfill de banco não casou: agrupa as baixas sem conta do período pelo
// perfil da despesa (nota numérica? importada? tem vínculo com o CA?) + amostra.
router.get('/diag-baixas-sem-banco', async (req, res) => {
    try {
        const de = new Date(`${String(req.query.de || '2026-06-01')}T00:00:00-03:00`);
        const ate = new Date(`${String(req.query.ate || '2026-07-31')}T23:59:59-03:00`);
        const pags = await prisma.pagamentoParcelaPagar.findMany({
            where: { estornado: false, contaFinanceiraCaId: null, dataPagamento: { gte: de, lte: ate } },
            select: {
                id: true, valorPago: true, dataPagamento: true, origem: true,
                parcelaPagar: {
                    select: {
                        idParcelaCA: true,
                        contaPagar: { select: { numeroNota: true, origem: true, statusEnvioCA: true, descricao: true, fornecedor: { select: { razaoSocial: true } } } }
                    }
                }
            }
        });
        const REGEX_NOTA = /^\d{3,}([-/.]\d{1,4})?$/;
        const grupos = { notaNumerica: 0, notaTextoLivre: 0, semNota: 0, comVinculoCA: 0 };
        const amostra = [];
        for (const p of pags) {
            const cp = p.parcelaPagar?.contaPagar;
            const nota = String(cp?.numeroNota || '').trim();
            if (p.parcelaPagar?.idParcelaCA) grupos.comVinculoCA++;
            else if (!nota) grupos.semNota++;
            else if (REGEX_NOTA.test(nota)) grupos.notaNumerica++;
            else grupos.notaTextoLivre++;
            if (amostra.length < 20) {
                amostra.push({
                    fornecedor: cp?.fornecedor?.razaoSocial || null,
                    descricao: (cp?.descricao || '').slice(0, 60),
                    nota: nota || null,
                    origemDespesa: cp?.origem || null,
                    envioCA: cp?.statusEnvioCA || null,
                    valor: Number(p.valorPago),
                    pago: p.dataPagamento
                });
            }
        }
        res.json({ ok: true, total: pags.length, grupos, amostra });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/diag-pagamentos-pagar?busca=kontisa — SOMENTE LEITURA.
// Lista as baixas (ledger) das despesas cujo fornecedor/descrição bate a busca.
router.get('/diag-pagamentos-pagar', async (req, res) => {
    try {
        const busca = String(req.query.busca || '').trim();
        if (busca.length < 3) return res.status(400).json({ error: 'busca com 3+ letras' });
        const contas = await prisma.contaPagar.findMany({
            where: {
                OR: [
                    { descricao: { contains: busca, mode: 'insensitive' } },
                    { fornecedor: { razaoSocial: { contains: busca, mode: 'insensitive' } } },
                    { fornecedor: { nomeFantasia: { contains: busca, mode: 'insensitive' } } }
                ]
            },
            include: {
                fornecedor: { select: { razaoSocial: true } },
                parcelas: { include: { pagamentos: true }, orderBy: { numeroParcela: 'asc' } }
            },
            orderBy: { criadoEm: 'desc' },
            take: 10
        });
        res.json({
            ok: true,
            contas: contas.map((c) => ({
                contaId: c.id, fornecedor: c.fornecedor?.razaoSocial, descricao: c.descricao,
                nota: c.numeroNota, status: c.status, envioCA: c.statusEnvioCA, valorTotal: Number(c.valorTotal),
                parcelas: c.parcelas.map((p) => ({
                    parcelaId: p.id, numero: p.numeroParcela, status: p.status, idParcelaCA: p.idParcelaCA,
                    pagamentos: p.pagamentos.map((pg) => ({
                        pagamentoId: pg.id, valorPago: Number(pg.valorPago), data: pg.dataPagamento,
                        origem: pg.origem, idBaixaCA: pg.idBaixaCA, estornado: pg.estornado,
                        contaFinanceiraCaId: pg.contaFinanceiraCaId
                    }))
                }))
            }))
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/ca-extrato-transferencias-sync — importa as transferências
// entre contas feitas no Conta Azul para a tabela TransferenciaConta (Saldos por
// Conta). Body: { dias: 30 } ou { de: 'YYYY-MM-DD', ate: 'YYYY-MM-DD' } p/ backfill.
// Idempotente (id da transferência no CA) — repetir não duplica.
router.post('/ca-extrato-transferencias-sync', async (req, res) => {
    try {
        const caExtratoService = require('../services/caExtratoService');
        const r = await caExtratoService.sincronizarTransferencias({
            dias: Number(req.body?.dias) || 30,
            de: req.body?.de || null,
            ate: req.body?.ate || null
        });
        res.json(r);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.response?.data || e.message });
    }
});

// POST /api/admin-exec/ca-extrato-despesas-sync — importa despesas lançadas
// direto no Conta Azul para o Contas a Pagar do app (IMPORTADO_CA/NAO_ENVIAR,
// parcelas com idParcelaCA; as baixas chegam pelo worker de 30min).
// Body: { dias: 2 } ou { de, ate } (janela de DATA DE ALTERAÇÃO no CA) e
// { limite: 400 } (máx. de contas novas por rodada). Idempotente.
router.post('/ca-extrato-despesas-sync', async (req, res) => {
    try {
        const caExtratoService = require('../services/caExtratoService');
        const r = await caExtratoService.sincronizarDespesas({
            dias: Number(req.body?.dias) || 2,
            de: req.body?.de || null,
            ate: req.body?.ate || null,
            limite: Number(req.body?.limite) || 400
        });
        res.json(r);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.response?.data || e.message });
    }
});

// POST /api/admin-exec/ca-extrato-conciliacao-sync — gera as linhas de extrato da
// Conciliação Bancária para as contas do Conta Azul (padrão: conta com "conta azul"
// no nome) a partir dos movimentos do app. Body: { dias } ou { de, ate }. Idempotente.
router.post('/ca-extrato-conciliacao-sync', async (req, res) => {
    try {
        const caExtratoService = require('../services/caExtratoService');
        const r = await caExtratoService.sincronizarExtratoConciliacao({
            dias: Number(req.body?.dias) || 30,
            de: req.body?.de || null,
            ate: req.body?.ate || null
        });
        res.json(r);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/ca-extrato-conciliacao-limpar — remove TODAS as linhas de
// extrato GERADAS automaticamente do Conta Azul (fitId ca-...) para regenerar do
// zero (ex.: após ajuste na regra anti-duplicidade). Não toca em linha de OFX/PDF.
router.post('/ca-extrato-conciliacao-limpar', async (req, res) => {
    try {
        const linhas = await prisma.extratoLancamento.findMany({
            where: { fitId: { startsWith: 'ca-' } },
            select: { id: true, importacaoId: true }
        });
        const ids = linhas.map(l => l.id);
        let removidas = 0;
        if (ids.length) {
            await prisma.$transaction(async (tx) => {
                await tx.transferenciaConta.updateMany({
                    where: { extratoLancamentoId: { in: ids } },
                    data: { extratoLancamentoId: null }
                });
                const r = await tx.extratoLancamento.deleteMany({ where: { id: { in: ids } } });
                removidas = r.count;
                // Importações "Conta Azul (automático)" que ficaram vazias
                await tx.extratoImportacao.deleteMany({
                    where: { nomeArquivo: 'Conta Azul (automático)', lancamentos: { none: {} } }
                });
            }, { timeout: 20000, maxWait: 10000 });
        }
        res.json({ ok: true, removidas });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/diag-ca-get?path=/v1/...
// SOMENTE LEITURA: repassa um GET cru à API v2 do Conta Azul (com o token OAuth
// de produção). Para sondar endpoints não documentados (ex.: extrato de conta
// financeira). Restrito a paths /v1/ — nunca faz escrita.
router.get('/diag-ca-get', async (req, res) => {
    try {
        const p = String(req.query.path || '').trim();
        if (!p.startsWith('/v1/')) return res.status(400).json({ error: 'Informe ?path=/v1/...' });
        try {
            const resp = await contaAzulService._axiosGet(`https://api-v2.contaazul.com${p}`, 'DIAG_CA_GET');
            res.json({ ok: true, path: p, status: resp.status, data: resp.data });
        } catch (e) {
            res.json({ ok: false, path: p, status: e.response?.status || null, data: e.response?.data || e.message });
        }
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/diag-parcela-ca-baixas?parcela=UUID
// SOMENTE LEITURA: detalhe cru de UMA parcela no CA + as baixas que já existem nela.
// Para investigar erros tipo "soma das baixas excede o valor nominal da parcela".
router.get('/diag-parcela-ca-baixas', async (req, res) => {
    try {
        const parcelaId = String(req.query.parcela || '').trim();
        if (!parcelaId) return res.status(400).json({ error: 'Informe ?parcela=UUID' });

        let detalhe = null, baixas = null;
        try { detalhe = await contaAzulService.buscarParcelaDetalhe(parcelaId); }
        catch (e) { detalhe = { erro: e.response?.data || e.message }; }
        try {
            const resp = await contaAzulService._axiosGet(
                `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/${parcelaId}/baixa`,
                'PARCELA_BAIXAS_DIAG'
            );
            baixas = Array.isArray(resp.data) ? resp.data : (resp.data?.itens || resp.data);
        } catch (e) { baixas = { erro: e.response?.data || e.message }; }

        res.json({ ok: true, parcelaId, detalhe, baixas });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/diag-baixas-pendentes-pagar[?parcelaCa=UUID]
// SOMENTE LEITURA: baixas "já paguei" aguardando envio ao CA (statusEnvioCA=ENVIAR),
// com fornecedor/descrição — para identificar qual conta está falhando no worker.
router.get('/diag-baixas-pendentes-pagar', async (req, res) => {
    try {
        const parcelaCa = String(req.query.parcelaCa || '').trim();
        const where = parcelaCa
            ? { parcelaPagar: { idParcelaCA: parcelaCa } }
            : { statusEnvioCA: 'ENVIAR', estornado: false };
        const pendentes = await prisma.pagamentoParcelaPagar.findMany({
            where,
            take: 30,
            orderBy: { dataPagamento: 'desc' },
            include: {
                parcelaPagar: {
                    include: {
                        contaPagar: {
                            select: {
                                id: true, descricao: true, numeroNota: true, status: true,
                                valorTotal: true, origem: true,
                                fornecedor: { select: { razaoSocial: true, nomeFantasia: true } }
                            }
                        }
                    }
                }
            }
        });
        res.json({
            ok: true,
            total: pendentes.length,
            baixas: pendentes.map((pg) => ({
                pagamentoId: pg.id,
                statusEnvioCA: pg.statusEnvioCA,
                erroEnvioCA: pg.erroEnvioCA,
                valorPago: Number(pg.valorPago),
                dataPagamento: pg.dataPagamento,
                formaPagamento: pg.formaPagamento,
                fornecedor: pg.parcelaPagar?.contaPagar?.fornecedor?.razaoSocial
                    || pg.parcelaPagar?.contaPagar?.fornecedor?.nomeFantasia || null,
                descricao: pg.parcelaPagar?.contaPagar?.descricao,
                numeroNota: pg.parcelaPagar?.contaPagar?.numeroNota,
                numeroParcela: pg.parcelaPagar?.numeroParcela,
                vencimento: pg.parcelaPagar?.dataVencimento,
                idParcelaCA: pg.parcelaPagar?.idParcelaCA,
                contaPagarId: pg.parcelaPagar?.contaPagar?.id
            }))
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/estornar-baixa-pagar/:pagamentoId?cancelarConta=1
// Mesmo fluxo do estorno da tela: baixa vinda do CA → exclui a baixa LÁ primeiro
// (404 = já não existe), depois estorna no ledger local e recalcula parcela/conta.
// Com cancelarConta=1, cancela a despesa em seguida (se não sobrar pagamento ativo).
router.post('/estornar-baixa-pagar/:pagamentoId', async (req, res) => {
    try {
        const contaAzulService = require('../services/contaAzulService');
        const caSync = require('../services/contasPagarCaSyncService');
        const pagamento = await prisma.pagamentoParcelaPagar.findUnique({
            where: { id: req.params.pagamentoId },
            include: { parcelaPagar: true }
        });
        if (!pagamento) return res.status(404).json({ error: 'Pagamento não encontrado.' });
        if (pagamento.estornado) return res.status(400).json({ error: 'Já estornado.' });

        let caExclusao = 'nao-precisou';
        if (pagamento.origem === 'CA') {
            if (!pagamento.idBaixaCA) return res.status(400).json({ error: 'Baixa do CA sem idBaixaCA.' });
            try {
                await contaAzulService.excluirBaixaFinanceira(pagamento.idBaixaCA);
                caExclusao = 'excluida';
            } catch (e) {
                if (e?.response?.status !== 404) {
                    return res.status(400).json({ ok: false, error: 'CA recusou excluir a baixa', status: e?.response?.status, detalhe: e?.response?.data || e.message });
                }
                caExclusao = 'ja-nao-existia';
            }
        }

        let resultado;
        await prisma.$transaction(async (tx) => {
            await tx.pagamentoParcelaPagar.update({
                where: { id: pagamento.id },
                data: { estornado: true, estornadoEm: new Date() }
            });
            resultado = await caSync.recalcularParcelaEConta(tx, pagamento.parcelaPagarId);
        }, { timeout: 20000, maxWait: 10000 });

        let cancelamento = null;
        if (String(req.query.cancelarConta || '') === '1') {
            const contaId = pagamento.parcelaPagar.contaPagarId;
            const ativos = await prisma.pagamentoParcelaPagar.count({
                where: { estornado: false, parcelaPagar: { contaPagarId: contaId } }
            });
            if (ativos > 0) {
                cancelamento = { ok: false, motivo: `${ativos} pagamento(s) ativo(s) — não cancelada` };
            } else {
                await prisma.$transaction([
                    prisma.parcelaPagar.updateMany({ where: { contaPagarId: contaId, status: { not: 'PAGO' } }, data: { status: 'CANCELADO' } }),
                    prisma.contaPagar.update({ where: { id: contaId }, data: { status: 'CANCELADO' } })
                ]);
                cancelamento = { ok: true };
            }
        }
        res.json({ ok: true, caExclusao, novoStatusParcela: resultado?.statusParcela, novoStatusConta: resultado?.statusConta, cancelamento });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/backfill-banco-importadas — progresso do job SEM iniciar nada
router.get('/backfill-banco-importadas', (req, res) => {
    try {
        const caSync = require('../services/contasPagarCaSyncService');
        res.json({ ok: true, ...caSync.statusBancoImportadas() });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/backfill-banco-importadas?de=2026-06-01&ate=2026-07-31
// Preenche o BANCO das baixas sem conta de despesas importadas do CA: casa por
// (descrição normalizada + dia do pagamento + total pago) numa varredura única do CA
// — as importadas vieram do CSV do próprio CA, então a descrição é idêntica lá — e
// copia a conta financeira da baixa quando o banco é inequívoco (parcela com
// idParcelaCA usa o detalhe direto). Async em segundo plano; GET devolve o progresso.
router.post('/backfill-banco-importadas', async (req, res) => {
    try {
        const caSync = require('../services/contasPagarCaSyncService');
        const de = String(req.query.de || '2026-06-01');
        const ate = String(req.query.ate || '2026-07-31');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) {
            return res.status(400).json({ error: 'Datas em YYYY-MM-DD.' });
        }
        const r = await caSync.backfillBancoImportadas({ de, ate });
        res.json(r);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/compras-estoque-check
// SOMENTE LEITURA. Para CADA nota CONFERIDA: quantos itens tinha, quantos estavam
// vinculados a produto/insumo (de-para memorizado) e quantas entradas de estoque
// (compras_itens ativas) foram registradas — mostra quem alimentou o estoque e quem não.
router.get('/compras-estoque-check', async (req, res) => {
    try {
        const notas = await prisma.notaEntrada.findMany({
            where: { status: 'CONFERIDA' },
            orderBy: { atualizadoEm: 'desc' },
            select: {
                id: true, tipo: true, numero: true, fornecedorNome: true, fornecedorCnpj: true,
                emissao: true, valorTotal: true, atualizadoEm: true,
                itens: { select: { codigoFornecedor: true, descricao: true } }
            }
        });

        // Compras ativas por nota
        const compras = await prisma.compraItem.groupBy({
            by: ['notaEntradaId'],
            where: { estornado: false },
            _count: { id: true }
        });
        const comprasPorNota = new Map(compras.map((c) => [c.notaEntradaId, c._count.id]));

        // Vínculos memorizados (produto OU insumo) por fornecedor+código
        const cnpjs = [...new Set(notas.map((n) => n.fornecedorCnpj).filter(Boolean))];
        const vinculos = await prisma.fornecedorProdutoVinculo.findMany({
            where: {
                fornecedorCnpj: { in: cnpjs },
                OR: [{ produtoId: { not: null } }, { itemPcpId: { not: null } }]
            },
            select: { fornecedorCnpj: true, codigoFornecedor: true }
        });
        const temVinculo = new Set(vinculos.map((v) => `${v.fornecedorCnpj}|${v.codigoFornecedor}`));

        const linhas = notas.map((n) => {
            const itens = n.itens.length;
            const itensVinculados = n.tipo === 'NFSE' ? 0 : n.itens
                .filter((i) => temVinculo.has(`${n.fornecedorCnpj}|${i.codigoFornecedor}`)).length;
            const entradas = comprasPorNota.get(n.id) || 0;
            let situacao;
            if (n.tipo === 'NFSE') situacao = 'SERVICO_SEM_ESTOQUE';       // serviço nunca movimenta
            else if (entradas > 0 && entradas >= itensVinculados) situacao = 'ALIMENTOU_ESTOQUE';
            else if (entradas > 0) situacao = 'PARCIAL';
            else if (itensVinculados > 0) situacao = 'SEM_ENTRADA_COM_VINCULO'; // conferida antes da Fase 6?
            else situacao = 'SEM_ENTRADA_SEM_VINCULO';
            return {
                numero: n.numero, tipo: n.tipo, fornecedor: n.fornecedorNome,
                emissao: n.emissao, valorTotal: n.valorTotal, conferidaEm: n.atualizadoEm,
                itens, itensVinculados, entradasEstoque: entradas, situacao
            };
        });

        const resumo = {};
        for (const l of linhas) resumo[l.situacao] = (resumo[l.situacao] || 0) + 1;

        res.json({ totalConferidas: linhas.length, resumo, notas: linhas });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── Fase 6: entrada RETROATIVA de compras (notas conferidas antes da fase) ──
// Monta, por nota CONFERIDA sem compras ativas, as entradas a partir do vínculo
// memorizado (fornecedor+cProd → produto/insumo + fator). Idempotente.
async function _montarEntradasRetroativas() {
    const notas = await prisma.notaEntrada.findMany({
        where: { status: 'CONFERIDA', tipo: { not: 'NFSE' } },
        select: {
            id: true, tipo: true, numero: true, fornecedorNome: true, fornecedorCnpj: true,
            fornecedorId: true, emissao: true, contaPagarId: true,
            itens: true,
            compras: { where: { estornado: false }, select: { id: true } }
        }
    });
    const pendentes = notas.filter((n) => n.compras.length === 0 && n.fornecedorCnpj);

    const resultado = [];
    for (const nota of pendentes) {
        const vinculos = await prisma.fornecedorProdutoVinculo.findMany({
            where: {
                fornecedorCnpj: nota.fornecedorCnpj,
                OR: [{ produtoId: { not: null } }, { itemPcpId: { not: null } }]
            },
            select: { codigoFornecedor: true, produtoId: true, itemPcpId: true, fatorConversao: true }
        });
        const porCodigo = new Map(vinculos.map((v) => [v.codigoFornecedor, v]));
        const entradas = [];
        for (const itemNota of nota.itens) {
            const v = porCodigo.get(itemNota.codigoFornecedor);
            if (!v) continue;
            entradas.push({
                itemNota,
                produtoId: v.produtoId || null,
                itemPcpId: v.produtoId ? null : v.itemPcpId,
                fator: Number(v.fatorConversao) > 0 ? Number(v.fatorConversao) : 1
            });
        }
        if (entradas.length > 0) resultado.push({ nota, entradas });
    }
    return resultado;
}

// GET /api/admin-exec/compras-retroativas-simulacao — SOMENTE LEITURA: o que seria lançado
router.get('/compras-retroativas-simulacao', async (req, res) => {
    try {
        const estoqueService = require('../services/estoqueService');
        const planos = await _montarEntradasRetroativas();
        const linhas = [];
        for (const { nota, entradas } of planos) {
            for (const e of entradas) {
                let alvo = null;
                let controla = null;
                if (e.produtoId) {
                    const p = await prisma.produto.findUnique({
                        where: { id: e.produtoId },
                        select: { nome: true, unidade: true, categoria: true, controlaEstoque: true }
                    });
                    alvo = p ? `PRODUTO: ${p.nome}` : 'PRODUTO (não encontrado)';
                    controla = p ? await estoqueService.produtoControlaEstoque(p) : false;
                } else if (e.itemPcpId) {
                    const i = await prisma.itemPcp.findUnique({ where: { id: e.itemPcpId }, select: { nome: true } });
                    alvo = i ? `INSUMO: ${i.nome}` : 'INSUMO (não encontrado)';
                    controla = true;
                }
                const qtd = Number(e.itemNota.quantidade) * e.fator;
                linhas.push({
                    nota: nota.numero,
                    fornecedor: nota.fornecedorNome,
                    item: e.itemNota.descricao,
                    alvo,
                    quantidadeConvertida: Math.round(qtd * 1000) / 1000,
                    valor: Number(e.itemNota.valorTotal),
                    custoUnitario: qtd > 0 ? Math.round((Number(e.itemNota.valorTotal) / qtd) * 10000) / 10000 : null,
                    movimentaEstoque: controla,
                    efeito: controla ? 'entrada de estoque + custo + histórico' : 'só custo + histórico (não controla estoque)'
                });
            }
        }
        res.json({ notasPendentes: planos.length, itens: linhas.length, linhas });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/compras-retroativas — EXECUTA as entradas retroativas (idempotente)
router.post('/compras-retroativas', async (req, res) => {
    try {
        const compraEstoqueService = require('../services/compraEstoqueService');
        const planos = await _montarEntradasRetroativas();
        let totalRegistradas = 0;
        const avisos = [];
        const porNota = [];
        for (const { nota, entradas } of planos) {
            const r = await compraEstoqueService.registrarEntradasCompra(nota, nota.contaPagarId, entradas, null);
            totalRegistradas += r.registradas;
            avisos.push(...r.avisos.map((a) => `Nota ${nota.numero}: ${a}`));
            porNota.push({ nota: nota.numero, fornecedor: nota.fornecedorNome, registradas: r.registradas });
        }
        res.json({ ok: true, notasProcessadas: planos.length, totalRegistradas, porNota, avisos });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/gerencial-diag
// SOMENTE LEITURA. Roda o Fluxo de Caixa e a DRE (Fase 5) e devolve um resumo
// compacto — validar os números reais em produção logo após o deploy.
router.get('/gerencial-diag', async (req, res) => {
    try {
        const svc = require('../services/financeiroGerencialService');
        const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const mes = hoje.slice(0, 7);
        const [fluxo, dreDados] = await Promise.all([
            svc.fluxoCaixa(`${mes}-01`, hoje, 'dia'),
            svc.dre(`${mes.slice(0, 4)}-01`, mes)
        ]);
        res.json({
            fluxo: { kpis: fluxo.kpis, totais: fluxo.totais, dias: fluxo.linhas.length },
            dre: {
                meses: dreDados.meses,
                receitaLiquida: dreDados.receita.liquida.valores,
                totalDespesas: dreDados.despesas.total.valores,
                resultado: dreDados.resultado.valores,
                topCategorias: dreDados.despesas.categorias.slice(0, 8).map((c) => `${c.nome}: ${c.total}`)
            }
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/nfse-status
// SOMENTE LEITURA. Status da captura de NFS-e (linha 'nfse' da dfe_controle) +
// contagem de notas NFSE — acompanhar o primeiro ciclo real em produção.
router.get('/nfse-status', async (req, res) => {
    try {
        const nfseAdnService = require('../services/nfseAdnService');
        const status = await nfseAdnService.statusCaptura();
        const [notasNfse, ultimas] = await Promise.all([
            prisma.notaEntrada.count({ where: { tipo: 'NFSE' } }),
            prisma.notaEntrada.findMany({
                where: { tipo: 'NFSE' },
                orderBy: { criadoEm: 'desc' },
                take: 5,
                select: { numero: true, fornecedorNome: true, valorTotal: true, emissao: true, status: true }
            })
        ]);
        res.json({ status, notasNfse, ultimas });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/nfse-ciclo
// Dispara UM ciclo de captura de NFS-e no ADN (síncrono) e devolve o resultado +
// status do controle. Diagnóstico da Fase 4 — validar o formato real da resposta
// do ambiente nacional sem depender do worker de 60min.
router.post('/nfse-ciclo', async (req, res) => {
    try {
        const nfseAdnService = require('../services/nfseAdnService');
        const resultado = await nfseAdnService.executarCiclo();
        const status = await nfseAdnService.statusCaptura();
        const notasNfse = await prisma.notaEntrada.count({ where: { tipo: 'NFSE' } });
        res.json({ resultado, status, notasNfse });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/gdrive-config
// Grava (upsert) a config do Google Drive em app_configs (chave gdrive_config).
// Body: { ativo, clientId, clientSecret, refreshToken, envioContabilidadeId }
// Nunca devolve os segredos — só confirma o que ficou salvo (mascarado).
router.post('/gdrive-config', async (req, res) => {
    try {
        const { ativo, clientId, clientSecret, refreshToken, envioContabilidadeId } = req.body || {};
        if (!clientId || !clientSecret || !refreshToken) {
            return res.status(400).json({ ok: false, error: 'clientId, clientSecret e refreshToken são obrigatórios.' });
        }
        const value = {
            ativo: ativo !== false,
            clientId, clientSecret, refreshToken,
            ...(envioContabilidadeId ? { envioContabilidadeId } : {}),
        };
        await prisma.appConfig.upsert({
            where: { key: 'gdrive_config' },
            update: { value },
            create: { key: 'gdrive_config', value },
        });
        try { require('../services/googleDriveService').limparCacheConfig(); } catch (_) {}
        const mask = (s) => (s ? `${String(s).slice(0, 6)}…${String(s).slice(-4)}` : null);
        res.json({ ok: true, salvo: { ativo: value.ativo, clientId: mask(clientId), refreshToken: mask(refreshToken), envioContabilidadeId: value.envioContabilidadeId || '(padrão)' } });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/gdrive-status
// Testa o acesso ao Drive com as credenciais atuais (não expõe segredos).
router.get('/gdrive-status', async (req, res) => {
    try {
        const googleDriveService = require('../services/googleDriveService');
        const r = await googleDriveService.testarAcesso();
        res.json(r);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ═══════════════ RÉGUA DE COBRANÇA (diagnóstico/config em produção) ═══════════════

// POST /api/admin-exec/cobranca-email-config
// Grava (upsert) a config SMTP em app_configs (chave email_config).
// Body: { ativo, host, port, secure, user, pass, from, fromName }
router.post('/cobranca-email-config', async (req, res) => {
    try {
        const { ativo, host, port, secure, user, pass, from, fromName } = req.body || {};
        if (!host || !user || !pass) {
            return res.status(400).json({ ok: false, error: 'host, user e pass são obrigatórios.' });
        }
        const value = { ativo: ativo !== false, host, port: Number(port || 465), secure: secure !== false, user, pass, from: from || user, fromName: fromName || 'Hardt Salgados' };
        await prisma.appConfig.upsert({
            where: { key: 'email_config' },
            update: { value },
            create: { key: 'email_config', value },
        });
        try { require('../services/emailService').limparCacheConfig(); } catch (_) {}
        res.json({ ok: true, salvo: { ativo: value.ativo, host, port: value.port, user, from: value.from } });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/cobranca-email-teste?para=alguem@dominio.com
// Verifica a conexão SMTP e (se ?para=) envia um e-mail de teste.
router.get('/cobranca-email-teste', async (req, res) => {
    try {
        const emailService = require('../services/emailService');
        const conexao = await emailService.testarConexao();
        let envio = null;
        if (conexao.ok && req.query.para) {
            envio = await emailService.enviar(req.query.para, 'Teste — Régua de Cobrança Hardt', '<p>E-mail de teste da régua de cobrança. Se você recebeu, o SMTP está funcionando. ✅</p>');
        }
        res.json({ conexao, envio });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/cobranca-executar — roda a régua agora (mesmo pausada)
router.post('/cobranca-executar', async (req, res) => {
    try {
        const cobrancaService = require('../services/cobrancaService');
        const r = await cobrancaService.executarRegua({ forcarManual: true });
        res.json(r);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/diag-catalogo-condicoes — SOMENTE LEITURA
// Mostra, por condição, se aparece no catálogo personalizado e se exige aprovação de crédito.
router.get('/diag-catalogo-condicoes', async (req, res) => {
    try {
        const condicoes = await prisma.$queryRawUnsafe(`
            SELECT id, nome_condicao, ativo,
                   permite_catalogo_personalizado AS catalogo,
                   exige_aprovacao_credito AS aprov_credito
            FROM tabela_precos
            ORDER BY id ASC
        `);
        res.json({
            ok: true,
            total: condicoes.length,
            ativas: condicoes.filter(c => c.ativo).length,
            no_catalogo: condicoes.filter(c => c.catalogo).length,
            condicoes
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/diag-pedido-site-condicao?numero=2213 — SOMENTE LEITURA
// Investiga por que um pedido vindo do Site Congelados saiu com determinada condição
// de pagamento e de onde veio o preço de cada item (base + acréscimo vs. último preço pago).
router.get('/diag-pedido-site-condicao', async (req, res) => {
    try {
        const numero = parseInt(req.query.numero, 10);
        if (!numero) return res.status(400).json({ error: 'Informe ?numero=' });

        const pedido = await prisma.pedido.findFirst({
            where: { numero },
            include: {
                cliente: { select: { UUID: true, Nome: true, NomeFantasia: true, Condicao_de_pagamento: true, condicoes_pagamento_permitidas: true } },
                itens: { include: { produto: { select: { id: true, nome: true, valorVenda: true } } } },
                congeladosPedido: { include: { itens: true } },
            },
        });
        if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });

        const condCliente = pedido.cliente?.Condicao_de_pagamento
            ? await prisma.tabelaPreco.findUnique({ where: { id: pedido.cliente.Condicao_de_pagamento } }).catch(() => null)
            : null;

        const cp = pedido.congeladosPedido;
        const condSite = cp?.tabelaPrecoId
            ? await prisma.tabelaPreco.findUnique({ where: { id: cp.tabelaPrecoId } }).catch(() => null)
            : null;

        // Tabela cujo nome bate com a condição gravada no pedido (para ver o acréscimo aplicado)
        const condDoPedido = pedido.nomeCondicaoPagamento
            ? await prisma.tabelaPreco.findFirst({ where: { nomeCondicao: pedido.nomeCondicaoPagamento } }).catch(() => null)
            : null;

        // De onde veio o preço: último preço pago pelo cliente em cada produto ANTES deste pedido
        const produtoIds = pedido.itens.map(i => i.produtoId);
        const anteriores = await prisma.pedidoItem.findMany({
            where: {
                produtoId: { in: produtoIds },
                pedido: {
                    clienteId: pedido.clienteId,
                    statusEnvio: { not: 'EXCLUIDO' },
                    createdAt: { lt: pedido.createdAt },
                },
            },
            select: {
                produtoId: true, valor: true,
                pedido: { select: { numero: true, createdAt: true, nomeCondicaoPagamento: true, canalOrigem: true } },
            },
            orderBy: { pedido: { createdAt: 'desc' } },
        });
        const ultimoAnterior = {};
        for (const it of anteriores) {
            if (!ultimoAnterior[it.produtoId]) ultimoAnterior[it.produtoId] = {
                valor: Number(it.valor),
                pedidoNumero: it.pedido?.numero,
                data: it.pedido?.createdAt,
                condicao: it.pedido?.nomeCondicaoPagamento,
                canal: it.pedido?.canalOrigem,
            };
        }

        // Preço de tabela do site para os mesmos produtos (precoCongelados ?? valorVenda)
        const cprods = await prisma.congeladosProduto.findMany({
            where: { produtoId: { in: produtoIds } },
            select: { produtoId: true, precoCongelados: true },
        });
        const precoSiteMap = {};
        cprods.forEach(c => { precoSiteMap[c.produtoId] = c.precoCongelados != null ? Number(c.precoCongelados) : null; });

        res.json({
            pedido: {
                numero: pedido.numero,
                createdAt: pedido.createdAt,
                updatedAt: pedido.updatedAt,
                dataVenda: pedido.dataVenda,
                canalOrigem: pedido.canalOrigem,
                observacoes: pedido.observacoes,
                nomeCondicaoPagamento: pedido.nomeCondicaoPagamento,
                tipoPagamento: pedido.tipoPagamento,
                opcaoCondicaoPagamento: pedido.opcaoCondicaoPagamento,
                especial: pedido.especial,
                condicaoDoPedidoTabela: condDoPedido ? { id: condDoPedido.id, acrescimo: Number(condDoPedido.acrescimoPreco), tipoPagamento: condDoPedido.tipoPagamento } : null,
                acrescimoCondicaoSite: condSite ? Number(condSite.acrescimoPreco) : null,
                flexTotal: Number(pedido.flexTotal),
                usuarioLancamentoId: pedido.usuarioLancamentoId,
                vendedorId: pedido.vendedorId,
                total: pedido.itens.reduce((s, i) => s + Number(i.valor) * Number(i.quantidade), 0),
            },
            cliente: {
                nome: pedido.cliente?.Nome,
                condicaoCadastrada: pedido.cliente?.Condicao_de_pagamento,
                condicaoCadastradaNome: condCliente?.nomeCondicao || null,
                acrescimoCondicao: condCliente ? Number(condCliente.acrescimoPreco) : null,
                condicoesPermitidas: pedido.cliente?.condicoes_pagamento_permitidas,
            },
            pedidoSite: cp ? {
                numero: cp.numero,
                createdAt: cp.createdAt,
                tabelaPrecoId: cp.tabelaPrecoId,
                condicaoNome: cp.condicaoNome,
                condicaoNomeAtual: condSite?.nomeCondicao || null,
                encaixe: cp.encaixe,
                tipoConversao: cp.tipoConversao,
                aprovadoPorId: cp.aprovadoPorId,
                aprovadoPorNome: cp.aprovadoPorId
                    ? (await prisma.vendedor.findUnique({ where: { id: cp.aprovadoPorId }, select: { nome: true } }).catch(() => null))?.nome || null
                    : null,
                aprovadoEm: cp.aprovadoEm,
                total: Number(cp.total),
                itens: cp.itens.map(i => ({ nome: i.nomeProduto, qtd: i.quantidade, precoUnitario: Number(i.precoUnitario) })),
            } : null,
            itens: pedido.itens.map(i => ({
                produto: i.produto?.nome,
                quantidade: Number(i.quantidade),
                valorCobrado: Number(i.valor),
                valorBase: Number(i.valorBase),
                flexGerado: Number(i.flexGerado),
                precoTabelaSite: precoSiteMap[i.produtoId] ?? null,
                valorVendaProduto: i.produto ? Number(i.produto.valorVenda) : null,
                ultimaCompraAnterior: ultimoAnterior[i.produtoId] || null,
            })),
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/corrigir-condicao-pedido — corrige a condição de pagamento de um pedido
// gravada errada (ex.: tela de edição auto-selecionou "À vista - Funcionário" num pedido do site).
// Body: { numero, tabelaId, aplicar }. Sem `aplicar: true` só simula (mostra antes/depois).
// Restaura valorBase = valor cobrado (como a conversão do site grava) e zera o flex.
router.post('/corrigir-condicao-pedido', async (req, res) => {
    try {
        const { numero, tabelaId, aplicar } = req.body || {};
        if (!numero || !tabelaId) return res.status(400).json({ ok: false, error: 'Informe numero e tabelaId.' });

        const pedido = await prisma.pedido.findFirst({
            where: { numero: parseInt(numero, 10), especial: false, bonificacao: false },
            include: { itens: true },
        });
        if (!pedido) return res.status(404).json({ ok: false, error: 'Pedido não encontrado.' });

        const tabela = await prisma.tabelaPreco.findUnique({ where: { id: String(tabelaId) } });
        if (!tabela) return res.status(404).json({ ok: false, error: 'Tabela de preço não encontrada.' });

        const resumo = {
            pedido: { numero: pedido.numero, statusEnvio: pedido.statusEnvio, situacaoCA: pedido.situacaoCA },
            antes: {
                nomeCondicaoPagamento: pedido.nomeCondicaoPagamento,
                tipoPagamento: pedido.tipoPagamento,
                opcaoCondicaoPagamento: pedido.opcaoCondicaoPagamento,
                flexTotal: Number(pedido.flexTotal),
                itens: pedido.itens.map(i => ({ valor: Number(i.valor), valorBase: Number(i.valorBase), flexGerado: Number(i.flexGerado) })),
            },
            depois: {
                nomeCondicaoPagamento: tabela.nomeCondicao,
                tipoPagamento: tabela.tipoPagamento,
                opcaoCondicaoPagamento: tabela.opcaoCondicao,
                qtdParcelas: tabela.qtdParcelas || 1,
                intervaloDias: tabela.parcelasDias || 0,
                flexTotal: 0,
                itens: pedido.itens.map(i => ({ valor: Number(i.valor), valorBase: Number(i.valor), flexGerado: 0 })),
            },
            aplicado: false,
        };
        if (!aplicar) return res.json({ ok: true, simulacao: true, ...resumo });

        await prisma.$transaction(async (tx) => {
            await tx.pedido.update({
                where: { id: pedido.id },
                data: {
                    nomeCondicaoPagamento: tabela.nomeCondicao,
                    tipoPagamento: tabela.tipoPagamento,
                    opcaoCondicaoPagamento: tabela.opcaoCondicao,
                    qtdParcelas: tabela.qtdParcelas || 1,
                    intervaloDias: tabela.parcelasDias || 0,
                    flexTotal: 0,
                },
            });
            for (const it of pedido.itens) {
                await tx.pedidoItem.update({ where: { id: it.id }, data: { valorBase: it.valor, flexGerado: 0 } });
            }
        }, { timeout: 20000, maxWait: 10000 });

        res.json({ ok: true, simulacao: false, ...resumo, aplicado: true });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

module.exports = router;
