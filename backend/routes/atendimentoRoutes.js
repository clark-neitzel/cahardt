const express = require('express');
const router = express.Router();
const atendimentoController = require('../controllers/atendimentoController');

// ── Gate do Painel de Atendimentos (`GET /filtros`) ──────────────────────────
// Espelha EXATAMENTE o `hasPermission` do frontend (AuthContext.jsx:107-123), que
// é como a tela é gateada em App.jsx:743 (`<PrivateRoute tab="Pode_Ver_Atendimentos">`):
//   1) admin passa direto;
//   2) se a chave for BOOLEAN (é a forma real: o painel de permissões declara
//      `Pode_Ver_Atendimentos: false` e usa MenuToggle), exige === true;
//   3) se algum cadastro antigo tiver gravado um OBJETO, vale `.view === true`.
//
// Repare que é `=== true` e `.view === true`, NUNCA `!!perm`: um objeto
// `{ view: false }` é truthy e liberaria quem está explicitamente barrado —
// a armadilha que já pegou este projeto três vezes.
//
// Por que só em `/filtros` e não no router inteiro: as outras rotas daqui
// (`/hoje`, `/pendencias-rota`, `/cliente/:id`, `/alertas-ativos`, POST `/`...)
// são a fila de trabalho da tela **Rota** e o histórico do popup do cliente —
// todo vendedor em campo depende delas e NENHUM precisa de `Pode_Ver_Atendimentos`.
// Gatear o router derrubaria a rota de campo inteira. `/filtros` tem um único
// consumidor: `PainelAtendimentos.jsx`, a tela que o frontend já gateia.
//
// Motivo de existir: sem gate, qualquer usuário logado (um motorista, por exemplo)
// conseguia `GET /api/atendimentos/filtros` e levava a carteira inteira da empresa.
// Desde 08/2026 a resposta traz também o `Telefone_Celular` do cliente (o selo de
// WhatsApp precisa dele), então o que vazava por aqui deixou de ser só nome e
// cidade e passou a ser o celular de todos os clientes.
const podeVerAtendimentos = (req, res, next) => {
    let perms = req.user?.permissoes;
    if (typeof perms === 'string') { try { perms = JSON.parse(perms); } catch { perms = {}; } }
    perms = perms || {};

    if (perms.admin === true) return next();

    const p = perms.Pode_Ver_Atendimentos;
    if (p === true) return next();
    if (p && typeof p === 'object' && p.view === true) return next();

    return res.status(403).json({ error: 'Você não tem permissão para ver o Painel de Atendimentos.' });
};

// IMPORTANTE: rotas fixas devem vir ANTES de /:id para não ser capturado como parâmetro
router.get('/hoje', atendimentoController.listarHojeVendedor);
router.get('/hoje-todos', atendimentoController.listarHojeTodos);
router.get('/filtros', podeVerAtendimentos, atendimentoController.listarComFiltros);
router.get('/pendencias-rota', atendimentoController.buscarPendenciasRota);
router.get('/transferidos', atendimentoController.listarTransferidos);
router.get('/alertas-ativos', atendimentoController.listarAlertasAtivos);
router.post('/', atendimentoController.registrar);
router.patch('/:id/alerta-visto', atendimentoController.marcarAlertaVisto);
router.patch('/:id/finalizar-transferencia', atendimentoController.finalizarTransferencia);
router.patch('/:id/transferencia-vista', atendimentoController.marcarTransferenciaVista);
router.get('/transferencias-resolvidas', atendimentoController.listarTransferenciasResolvidas);
router.get('/lead/:leadId', atendimentoController.listarPorLead);
router.get('/cliente/:clienteId', atendimentoController.listarPorCliente);
router.delete('/:id', atendimentoController.excluir);

module.exports = router;
