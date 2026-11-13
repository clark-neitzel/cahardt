// API de máquina dos agentes comerciais. Chave própria (x-analytics-key).
// Não usa o JWT do app. Não envia WhatsApp. Não grava pedido nem financeiro.
const express = require('express');
const { verificarChaveAnalytics } = require('../middlewares/analyticsAuth');
const { exigirBackup } = require('../middlewares/analyticsBackupAuth');
const consulta = require('../services/analyticsConsultaService');
const registro = require('../services/analyticsRegistroService');
const contatos = require('../services/clienteContatoService');
const historico = require('../services/clienteHistoricoService');
const fichaSvc = require('../services/analyticsClienteFichaService');
const inativacao = require('../services/clienteInativacaoService');
const classif = require('../services/clienteClassificacaoService');
const backup = require('../services/analyticsBackupService');
const telefones = require('../services/clienteTelefonesService');
const { exigirAgente } = require('../services/clienteContatoRegras');

const router = express.Router();

router.use(verificarChaveAnalytics);

function asyncRoute(fn) {
    return (req, res) => {
        Promise.resolve(fn(req, res)).catch((err) => {
            const status = Number(err?.status) || 500;
            if (status >= 500) console.error('[Analytics]', err?.message || err);
            if (res.headersSent) return;
            const body = { error: status >= 500 ? 'Erro interno.' : (err?.message || 'Erro.') };
            if (err?.codigo && status < 500) body.codigo = err.codigo;
            if (err?.contatos && status < 500) body.contatos = err.contatos;
            if (err?.pessoas && status < 500) body.pessoas = err.pessoas;
            res.status(status).json(body);
        });
    };
}

function agente(req) {
    return req.headers['x-analytics-agent'];
}

router.get('/v1/status', (req, res) => {
    res.json({
        ok: true,
        versao: '1',
        whatsapp: false,
        escreve: ['atendimentos', 'leads', 'sugestoes', 'contatos', 'inativacoes', 'classificacoes'],
    });
});

// Dump completo do Postgres, em stream. Chave extra (BACKUP_API_KEY) + agente luke.
// Não usa asyncRoute: o corpo é binário, e um 500 precisa ir com codigo sem
// repetir o stderr do pg_dump (pode citar a senha se a gente escorregar).
router.get('/v1/backup', (req, res) => {
    Promise.resolve()
        .then(async () => {
            exigirBackup(req);
            await backup.executar(req, res);
        })
        .catch((err) => {
            const status = Number(err?.status) || 500;
            if (!err?.codigo) console.error('[Analytics][Backup]', err?.message || err);
            if (res.headersSent || res.writableEnded || res.destroyed) return;
            res.status(status).json({
                error: status >= 500 && !err?.codigo ? 'Erro interno.' : (err?.message || 'Erro.'),
                codigo: err?.codigo || 'ERRO',
            });
        });
});

router.get('/v1/carteira', asyncRoute(async (req, res) => {
    res.json(await consulta.painel(req.query));
}));

router.get('/v1/clientes', asyncRoute(async (req, res) => {
    const r = await consulta.clientes(req.query);
    // Enriquece DEPOIS da página pronta (uma query só para a página); a carteira não muda.
    await classif.enriquecer(r?.data, (c) => c.clienteId || c.id);
    res.json(r);
}));

// Ficha completa do cliente para o agente (identificação, dias, tabela, vendedor, pedidos, produtos, contatos).
router.get('/v1/clientes/:id/ficha', asyncRoute(async (req, res) => {
    res.json(await fichaSvc.ficha(req.params.id));
}));

// Cadastros ativos: ?grupo=acertar (padrão: clientes com cadastro incompleto) | classificar (a classificar).
// Só leitura.
router.get('/v1/cadastros-pendentes', asyncRoute(async (req, res) => {
    res.json(await fichaSvc.cadastrosPendentes(req.query));
}));

// O agente PEDE a inativação; quem inativa é uma pessoa, na fila do app.
router.post('/v1/clientes/:id/inativacao', asyncRoute(async (req, res) => {
    const quem = exigirAgente(agente(req));
    const r = await inativacao.solicitar(req.params.id, req.body, { agente: quem });
    res.status(r.status).json({ duplicado: r.duplicado, solicitacao: r.solicitacao });
}));

// Classificação manual (cliente / fornecedor / os dois) por cima da automática; "automatica" desfaz.
router.post('/v1/clientes/:id/classificacao', asyncRoute(async (req, res) => {
    const quem = exigirAgente(agente(req));
    res.json({ classificacao: await classif.classificar(req.params.id, req.body, { agente: quem }) });
}));

router.get('/v1/inativacoes', asyncRoute(async (req, res) => {
    res.json(await inativacao.listar(req.query));
}));

router.get('/v1/clientes/:id/financeiro', asyncRoute(async (req, res) => {
    res.json(await consulta.financeiroCliente(req.params.id));
}));

router.get('/v1/clientes/:id/contatos', asyncRoute(async (req, res) => {
    res.json(await contatos.listar(req.params.id));
}));

// Telefones para WhatsApp na ORDEM PREFERIDA (o 1º válido é o preferido), número já no formato da
// Z-API (55 + DDD + número), situação (ok | normalizado | incompleto) e o "funcionando" (o último que respondeu).
router.get('/v1/clientes/:id/telefones', asyncRoute(async (req, res) => {
    res.json(await telefones.listar(req.params.id));
}));

// O agente grava a ordem (body.ordem: números, o preferido primeiro; [] = ordem padrão).
router.put('/v1/clientes/:id/telefones/ordem', asyncRoute(async (req, res) => {
    const quem = exigirAgente(agente(req));
    res.json(await telefones.definirOrdem(req.params.id, req.body, { agente: quem }));
}));

// O bot avisa que o número RESPONDEU no WhatsApp (body.telefone) → vira o "funcionando".
router.post('/v1/clientes/:id/telefones/funcionando', asyncRoute(async (req, res) => {
    const quem = exigirAgente(agente(req));
    res.json(await telefones.marcarFuncionando(req.params.id, req.body, { agente: quem }));
}));

// Histórico de alterações do cadastro (uso interno — nunca mostrar ao cliente). Só leitura.
router.get('/v1/clientes/:id/alteracoes', asyncRoute(async (req, res) => {
    res.json(await historico.listar(req.params.id, req.query));
}));

router.post('/v1/clientes/:id/contatos', asyncRoute(async (req, res) => {
    const agente = exigirAgente(req.headers['x-analytics-agent']);
    const r = await contatos.gravar(req.params.id, req.body, { agente });
    res.status(r.status).json(r);
}));

router.get('/v1/contatos/por-telefone', asyncRoute(async (req, res) => {
    const r = await contatos.buscarPorTelefone(req.query.telefone);
    await classif.enriquecer(r.data, (c) => c.clienteId);
    res.json(r);
}));

router.patch('/v1/contatos/:id', asyncRoute(async (req, res) => {
    const agente = exigirAgente(req.headers['x-analytics-agent']);
    res.json(await contatos.atualizar(req.params.id, req.body, { agente }));
}));

router.post('/v1/contatos/:id/conversa', asyncRoute(async (req, res) => {
    const agente = exigirAgente(req.headers['x-analytics-agent']);
    res.json(await contatos.registrarConversa(req.params.id, req.body, { agente }));
}));

function semExclusao(_req, res) {
    res.status(405).json({ error: 'Esta API não apaga contato.', codigo: 'SEM_EXCLUSAO' });
}
router.delete('/v1/contatos/:id', semExclusao);
router.delete('/v1/clientes/:id/contatos/:contatoId', semExclusao);

router.get('/v1/vendas', asyncRoute(async (req, res) => {
    res.json(await consulta.vendas(req.query));
}));

router.get('/v1/vendas/itens', asyncRoute(async (req, res) => {
    res.json(await consulta.vendasItens(req.query));
}));

router.get('/v1/produtos', asyncRoute(async (req, res) => {
    res.json(await consulta.produtos(req.query));
}));

router.get('/v1/tabelas-preco', asyncRoute(async (req, res) => {
    res.json(await consulta.tabelasPreco(req.query));
}));

router.get('/v1/promocoes', asyncRoute(async (req, res) => {
    res.json(await consulta.promocoes(req.query));
}));

router.get('/v1/vendedores', asyncRoute(async (req, res) => {
    res.json(await consulta.vendedores(req.query));
}));

router.get('/v1/atendimentos', asyncRoute(async (req, res) => {
    res.json(await consulta.atendimentos(req.query));
}));

router.post('/v1/atendimentos', asyncRoute(async (req, res) => {
    const r = await registro.registrarAtendimento(agente(req), req.body);
    res.status(r.duplicado ? 200 : 201).json(r);
}));

router.get('/v1/diarios', asyncRoute(async (req, res) => {
    res.json(await consulta.diarios(req.query));
}));

router.get('/v1/receber', asyncRoute(async (req, res) => {
    res.json(await consulta.receber(req.query));
}));

router.get('/v1/leads', asyncRoute(async (req, res) => {
    res.json(await consulta.leads(req.query));
}));

router.post('/v1/leads', asyncRoute(async (req, res) => {
    res.status(201).json(await registro.criarLead(agente(req), req.body));
}));

router.patch('/v1/leads/:id', asyncRoute(async (req, res) => {
    res.json(await registro.atualizarLead(agente(req), req.params.id, req.body));
}));

router.get('/v1/sugestoes', asyncRoute(async (req, res) => {
    res.json(await registro.listarSugestoes(req.query));
}));

router.post('/v1/sugestoes', asyncRoute(async (req, res) => {
    const r = await registro.criarSugestao(agente(req), req.body);
    res.status(r.duplicado ? 200 : 201).json(r);
}));

router.patch('/v1/sugestoes/:sugestaoId', asyncRoute(async (req, res) => {
    res.json(await registro.atualizarSugestao(agente(req), req.params.sugestaoId, req.body));
}));

router.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada nesta API.', codigo: 'ROTA_DESCONHECIDA' });
});

module.exports = router;
