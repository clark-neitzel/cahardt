/**
 * Indicadores de Gestão — /api/indicadores-gestao
 * Contrato: docs/plano-dashboard-indicadores.md §3.3
 *
 * Permissão (lida do banco a cada chamada; espelha o frontend: admin = tudo, chave booleana = === true):
 *  - completo : admin OU Pode_Ver_Indicadores_Gestao
 *  - produção : completo OU Pode_Ver_Indicadores_Producao
 * Quem NÃO é completo (ou pede ?foco=producao) recebe só fabricados/insumos, sem campos financeiros —
 * o filtro é feito AQUI, no servidor.
 */
const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const verificarAuth = require('../middlewares/authMiddleware');
const gestao = require('../services/indicadoresGestaoService');
const configService = require('../services/indicadoresConfigService');
const metasService = require('../services/indicadoresMetasService');

const lerPerms = async (userId) => {
    const v = await prisma.vendedor.findUnique({ where: { id: userId }, select: { permissoes: true } });
    return typeof v?.permissoes === 'string' ? JSON.parse(v.permissoes) : (v?.permissoes || {});
};

/** nivel: 'completo' | 'producao' | 'admin' */
const exigir = (nivel, msgAdmin) => async (req, res, next) => {
    try {
        const perms = await lerPerms(req.user.id);
        const admin = !!perms.admin; // mesmo critério do hasPermission do frontend (admin = true)
        const completo = admin || perms.Pode_Ver_Indicadores_Gestao === true;
        const producao = completo || perms.Pode_Ver_Indicadores_Producao === true;
        req._nivelIndicadores = { admin, completo, producao };
        if (nivel === 'admin' && !admin) return res.status(403).json({ error: msgAdmin || 'Só administrador pode alterar esta configuração.' });
        if (nivel === 'completo' && !completo) return res.status(403).json({ error: 'Sem permissão para ver os indicadores de gestão.' });
        if (nivel === 'producao' && !producao) return res.status(403).json({ error: 'Sem permissão para ver os indicadores de produção.' });
        next();
    } catch (e) {
        console.error('[Indicadores] erro ao checar permissão:', e);
        res.status(403).json({ error: 'Erro ao verificar permissão.' });
    }
};

const rota = (fn) => async (req, res) => {
    try {
        res.json(await fn(req));
    } catch (e) {
        if (e.status === 400) return res.status(400).json({ error: e.message });
        console.error('[Indicadores] erro:', e);
        res.status(500).json({ error: 'Erro ao calcular os indicadores.' });
    }
};

const foco = (req) => (req.query.foco === 'producao' ? 'producao' : 'todos');
// visão completa só quando o usuário é completo E não pediu foco=producao
const completoEfetivo = (req) => req._nivelIndicadores.completo && foco(req) !== 'producao';

router.get('/resumo', verificarAuth, exigir('completo'), rota((req) => gestao.resumo(req.query)));
router.get('/cascata', verificarAuth, exigir('completo'), rota((req) => gestao.cascata(req.query)));
router.get('/equilibrio', verificarAuth, exigir('completo'), rota((req) => gestao.equilibrio({ mes: req.query.mes })));
router.get('/clientes', verificarAuth, exigir('completo'), rota((req) => gestao.clientes(req.query)));
router.get('/categorias-pendentes', verificarAuth, exigir('completo'), rota(() => gestao.categoriasPendentes()));

router.get('/insumos-semanal', verificarAuth, exigir('producao'), rota((req) =>
    gestao.insumosSemanal({ semanas: req.query.semanas, de: req.query.de, ate: req.query.ate, completo: completoEfetivo(req) })));
router.get('/entradas-semana', verificarAuth, exigir('producao'), rota((req) =>
    gestao.entradasSemana({ semanaOffset: req.query.semanaOffset, reduzido: !completoEfetivo(req) })));
router.get('/produtos', verificarAuth, exigir('producao'), rota((req) =>
    gestao.produtos({ de: req.query.de, ate: req.query.ate, foco: foco(req), completo: req._nivelIndicadores.completo, ordem: req.query.ordem })));
router.get('/producao', verificarAuth, exigir('producao'), rota((req) => gestao.producao({ ...req.query, completo: completoEfetivo(req) })));
router.get('/alertas', verificarAuth, exigir('producao'), rota((req) =>
    gestao.alertas({ de: req.query.de, ate: req.query.ate, completo: req._nivelIndicadores.completo, foco: foco(req) })));

router.get('/config', verificarAuth, exigir('completo'), rota(async () => ({ aliquotaImpostoVenda: await configService.getAliquota() })));
router.put('/config', verificarAuth, exigir('admin'), async (req, res) => {
    try {
        const v = await configService.setAliquota(req.body?.aliquotaImpostoVenda);
        require('../services/indicadoresCustoService').limparCache();
        res.json({ aliquotaImpostoVenda: v });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// ── Metas (Etapa 3): leitura filtrada por escopo; escrita e sugestão só admin ──
router.get('/metas/sugestao', verificarAuth, exigir('admin', 'Só administrador pode ver a sugestão de metas.'), rota(() => metasService.sugerirPelaMedia()));
router.get('/metas', verificarAuth, exigir('producao'), rota((req) =>
    metasService.listar({ completo: req._nivelIndicadores.completo, admin: req._nivelIndicadores.admin })));
router.put('/metas', verificarAuth, exigir('admin'), rota(async (req) => {
    const v = await prisma.vendedor.findUnique({ where: { id: req.user.id }, select: { nome: true } });
    const r = await metasService.salvarLote(req.body?.metas, { userId: req.user.id, userNome: v?.nome || null });
    require('../services/indicadoresCustoService').limparCache(); // meta nova vale na hora
    return r;
}));

module.exports = router;
