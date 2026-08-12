// Rotas do módulo "Ponto GPS confiável por cliente" (montado em /api/gps-clientes,
// atrás do authMiddleware). Regras e cálculo: services/gpsClientesService.js.
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const gps = require('../services/gpsClientesService');
const uploadFachada = require('../middlewares/uploadGpsFachadaMiddleware');

const getPerms = async (userId) => {
    const v = await prisma.vendedor.findUnique({ where: { id: userId }, select: { permissoes: true } });
    return (typeof v?.permissoes === 'string' ? JSON.parse(v.permissoes) : v?.permissoes) || {};
};

const getAutor = async (userId) => {
    const v = await prisma.vendedor.findUnique({ where: { id: userId }, select: { id: true, nome: true } });
    return { id: userId, nome: v?.nome || null };
};

const exigirPermissao = (chave) => async (req, res, next) => {
    try {
        const perms = await getPerms(req.user.id);
        if (!perms.admin && !perms[chave]) {
            return res.status(403).json({ error: 'Sem permissão para esta ação.' });
        }
        req._perms = perms;
        next();
    } catch (e) { next(e); }
};

const trataErro = (res, error, contexto) => {
    console.error(`[GpsClientes] ${contexto}:`, error.message);
    res.status(error.status || 500).json({
        error: error.message || 'Erro interno.',
        codigo: error.codigo || undefined,
        clienteConflito: error.clienteConflito || undefined
    });
};

// ── Config (interruptor "exigir GPS no envio do pedido") ─────────────────────

router.get('/config', async (req, res) => {
    try { res.json(await gps.getConfig()); }
    catch (e) { trataErro(res, e, 'config'); }
});

router.post('/config', exigirPermissao('Pode_Autorizar_Ponto_Gps'), async (req, res) => {
    try {
        const { exigirNoPedido } = req.body;
        res.json(await gps.setConfig({ exigirNoPedido: exigirNoPedido === true }));
    } catch (e) { trataErro(res, e, 'set-config'); }
});

// ── Validação prévia (o mapa consulta enquanto o usuário escolhe) ────────────

router.get('/validar', async (req, res) => {
    try {
        const { ponto, clienteUuid } = req.query;
        const problema = await gps.validarPonto(ponto, clienteUuid || null);
        res.json({ ok: !problema, problema });
    } catch (e) { trataErro(res, e, 'validar'); }
});

// ── Dados de GPS de um cliente ───────────────────────────────────────────────

router.get('/cliente/:uuid', async (req, res) => {
    try {
        const cliente = await prisma.cliente.findUnique({
            where: { UUID: req.params.uuid },
            select: {
                UUID: true, Nome: true, NomeFantasia: true, Ponto_GPS: true,
                End_Logradouro: true, End_Numero: true, End_Bairro: true, End_Cidade: true,
                gps: true
            }
        });
        if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });
        const logs = await prisma.clienteGpsLog.findMany({
            where: { clienteUuid: req.params.uuid },
            orderBy: { createdAt: 'desc' },
            take: 10
        });
        res.json({ cliente, logs });
    } catch (e) { trataErro(res, e, 'cliente'); }
});

// ── Endereço escrito × ponto GPS (selo nos cards da rota organizada) ─────────

router.get('/cliente/:uuid/endereco-vs-gps', async (req, res) => {
    try { res.json(await gps.enderecoVsGps(req.params.uuid)); }
    catch (e) { trataErro(res, e, 'endereco-vs-gps'); }
});

// Lote: body { uuids: [...] } (máx. 10 por chamada) → { uuid: resultado }
router.post('/endereco-vs-gps-lote', async (req, res) => {
    try { res.json(await gps.enderecoVsGpsLote(req.body?.uuids)); }
    catch (e) { trataErro(res, e, 'endereco-vs-gps-lote'); }
});

// Coordenada do endereço escrito ("lat,lng") — centra o mapa do Ajustar ponto
router.get('/cliente/:uuid/geocode-endereco', async (req, res) => {
    try { res.json(await gps.geocodeEnderecoDoCliente(req.params.uuid)); }
    catch (e) { trataErro(res, e, 'geocode-endereco'); }
});

// ── Salvar/mover o ponto ─────────────────────────────────────────────────────

router.post('/cliente/:uuid/ponto', async (req, res) => {
    try {
        // Mesmo gate do PATCH de cliente (quem já podia editar GPS continua podendo)
        const perms = await getPerms(req.user.id);
        const podeEditarGPS = perms.admin || perms.Pode_Editar_GPS || perms.clientes?.edit || perms.Pode_Executar_Entregas;
        if (!podeEditarGPS) return res.status(403).json({ error: 'Sem permissão para editar o ponto GPS.' });

        const { ponto, posicaoAutor, origem, autorizacao } = req.body;
        const autor = await getAutor(req.user.id);
        const r = await gps.registrarMudanca({
            clienteUuid: req.params.uuid,
            pontoNovo: ponto,
            autor,
            origem: origem || null,
            posicaoAutor: posicaoAutor || null,
            autorizacao: autorizacao || null
        });
        res.json(r);
    } catch (e) { trataErro(res, e, 'salvar-ponto'); }
});

// ── Cliente balcão ───────────────────────────────────────────────────────────

router.post('/cliente/:uuid/balcao', exigirPermissao('Pode_Liberar_Cliente_Balcao'), async (req, res) => {
    try {
        const autor = await getAutor(req.user.id);
        res.json(await gps.setBalcao(req.params.uuid, req.body.ativo === true, autor));
    } catch (e) { trataErro(res, e, 'balcao'); }
});

// ── "Estou na porta" do motorista (com foto da fachada obrigatória) ──────────

router.post('/cliente/:uuid/na-porta', uploadFachada.single('foto'), async (req, res) => {
    try {
        const { ponto, pedidoId } = req.body;
        if (!ponto) return res.status(400).json({ error: 'Sem posição GPS — ative o GPS e tente de novo.' });
        if (!req.file) return res.status(400).json({ error: 'A foto da fachada é obrigatória para confirmar o ponto novo.' });

        const fotoPath = `/uploads/gps-fachada/${req.params.uuid}/${req.file.filename}`;
        const autor = await getAutor(req.user.id);

        await prisma.clienteGpsSinal.create({
            data: {
                clienteUuid: req.params.uuid,
                ponto: String(ponto),
                pedidoId: pedidoId || null,
                autorId: autor.id,
                autorNome: autor.nome,
                fotoFachada: fotoPath
            }
        });
        await prisma.clienteGps.upsert({
            where: { clienteUuid: req.params.uuid },
            update: { fotoFachada: fotoPath },
            create: { clienteUuid: req.params.uuid, fotoFachada: fotoPath }
        });

        // Cliente ainda sem ponto cadastrado: o "estou na porta" vira o primeiro
        // ponto (regra aprovada: primeiro ponto aplica na hora). Se a validação
        // barrar (duplicado/empresa), o sinal fica registrado mesmo assim.
        let pontoDefinido = false;
        const clienteAtual = await prisma.cliente.findUnique({
            where: { UUID: req.params.uuid }, select: { Ponto_GPS: true }
        });
        if (!clienteAtual?.Ponto_GPS) {
            try {
                const r = await gps.registrarMudanca({
                    clienteUuid: req.params.uuid, pontoNovo: String(ponto),
                    autor, origem: 'MOTORISTA', posicaoAutor: String(ponto)
                });
                pontoDefinido = r.aplicado === true;
            } catch (mudErr) {
                console.error('[GpsClientes] primeiro ponto via na-porta não aplicado:', mudErr.message);
            }
        }

        // Reavaliar selo em background (não segura a resposta do motorista)
        gps.reavaliarCliente(req.params.uuid).catch(err =>
            console.error('[GpsClientes] reavaliar pós-na-porta:', err.message));

        res.json({ ok: true, foto: fotoPath, pontoDefinido });
    } catch (e) { trataErro(res, e, 'na-porta'); }
});

// ── Saúde geral (tela do escritório) ─────────────────────────────────────────

router.get('/saude', async (req, res) => {
    try { res.json(await gps.saude()); }
    catch (e) { trataErro(res, e, 'saude'); }
});

// ── Pendências de aprovação (logística) ──────────────────────────────────────

router.post('/pendencias/:id/decidir', exigirPermissao('Pode_Autorizar_Ponto_Gps'), async (req, res) => {
    try {
        const decisor = await getAutor(req.user.id);
        const { aprovar, motivo } = req.body;
        res.json(await gps.decidirPendencia(req.params.id, aprovar === true, decisor, motivo));
    } catch (e) { trataErro(res, e, 'decidir-pendencia'); }
});

// ── Histórico + desfazer ─────────────────────────────────────────────────────

router.get('/historico', async (req, res) => {
    try {
        const { clienteUuid } = req.query;
        // Por cliente (ficha): mostra TUDO, inclusive pendências de aprovação —
        // senão o ajuste "some" da ficha enquanto espera a logística.
        // Global (Saúde GPS): pendências ficam fora (têm seção própria lá).
        const logs = await prisma.clienteGpsLog.findMany({
            where: clienteUuid ? { clienteUuid } : { status: { not: 'PENDENTE' } },
            include: { cliente: { select: { Nome: true, NomeFantasia: true } } },
            orderBy: { createdAt: 'desc' },
            take: 100
        });
        res.json(logs.map(l => ({
            id: l.id, clienteUuid: l.clienteUuid,
            cliente: l.cliente?.NomeFantasia || l.cliente?.Nome || '—',
            tipo: l.tipo, status: l.status,
            pontoAntigo: l.pontoAntigo, pontoNovo: l.pontoNovo, distanciaM: l.distanciaM,
            autor: l.autorNome, posicaoAutor: l.posicaoAutor, origem: l.origem,
            autorizadoPor: l.autorizadoPorNome, decididoPor: l.decididoPorNome,
            criadoEm: l.createdAt
        })));
    } catch (e) { trataErro(res, e, 'historico'); }
});

router.post('/historico/:id/desfazer', exigirPermissao('Pode_Autorizar_Ponto_Gps'), async (req, res) => {
    try {
        const decisor = await getAutor(req.user.id);
        res.json(await gps.desfazerMudanca(req.params.id, decisor));
    } catch (e) { trataErro(res, e, 'desfazer'); }
});

// ── Divergências da carteira (aviso na tela inicial do vendedor) ─────────────

router.get('/minhas-divergencias', async (req, res) => {
    try { res.json(await gps.divergenciasDoVendedor(req.user.id)); }
    catch (e) { trataErro(res, e, 'minhas-divergencias'); }
});

// ── Autorizadores disponíveis (para o modal de liberação por senha) ──────────

router.get('/autorizadores', async (req, res) => {
    try {
        const vendedores = await prisma.vendedor.findMany({
            where: { ativo: true, acessoExterno: false },
            select: { id: true, nome: true, permissoes: true }
        });
        const lista = vendedores.filter(v => {
            const p = (typeof v.permissoes === 'string' ? JSON.parse(v.permissoes) : v.permissoes) || {};
            return p.admin || p.Pode_Autorizar_Ponto_Gps;
        }).map(v => ({ id: v.id, nome: v.nome }));
        res.json(lista);
    } catch (e) { trataErro(res, e, 'autorizadores'); }
});

module.exports = router;
