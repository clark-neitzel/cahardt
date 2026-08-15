/**
 * CANHOTO DA NOTA FISCAL — rotas do módulo (Pedaço 1).
 *
 * Montado em /api/canhotos com authMiddleware (index.js).
 * Regra de ouro do módulo: o caminho normal NUNCA devolve 500. Quem está do outro
 * lado é uma pessoa com um maço de papel na mão passando o leitor folha por folha —
 * chave desconhecida, código rasgado ou leitura torta são situações ESPERADAS e
 * voltam como `200 { ok:false, motivo }` para a tela explicar em português.
 * 500 fica reservado para defeito de verdade.
 *
 * Permissões (JSON do vendedor):
 *   ver/bipar o arquivo do mês  → Pode_Acessar_Notas_Fiscais
 *   bipar na volta do motorista → Pode_Acessar_Caixa / Pode_Editar_Caixa
 *   ligar/desligar a chave      → admin
 * Bipar NÃO ganha permissão nova (decisão do plano): quem já entra no Caixa ou em
 * Notas Fiscais bipa.
 */
const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const canhoto = require('../services/canhotoService');
const canhotoConfig = require('../config/canhotoConfig');

// ── Permissões ───────────────────────────────────────────────────────────────
const perms = (req) => req.user?.permissoes || {};

const podeNotas = (p) => !!(p.admin || p.Pode_Acessar_Notas_Fiscais);
const podeCaixa = (p) => !!(p.admin || p.Pode_Acessar_Caixa || p.Pode_Editar_Caixa);

/** Bipar/arquivar: quem acessa o Caixa OU as Notas Fiscais. */
const checkBipar = (req, res, next) => {
    const p = perms(req);
    if (podeNotas(p) || podeCaixa(p)) return next();
    return res.status(403).json({ error: 'Sem permissão para bipar canhotos.' });
};

/** Arquivo do mês (aba Canhotos em Notas Fiscais). */
const checkNotas = (req, res, next) => {
    if (podeNotas(perms(req))) return next();
    return res.status(403).json({ error: 'Sem permissão para acessar as notas fiscais.' });
};

const checkAdmin = (req, res, next) => {
    if (perms(req).admin) return next();
    return res.status(403).json({ error: 'Só o administrador liga ou desliga o controle de canhotos.' });
};

/**
 * Quem está bipando (vai para `recebidoPorNome`/`arquivadoPorNome`).
 * O nome já vem no token; a consulta ao banco é só rede de segurança para token
 * antigo sem `nome` — sem ela, o histórico ficaria "recebido por (em branco)".
 */
async function usuarioDaRequisicao(req) {
    const id = req.user?.id || null;
    let nome = req.user?.nome || null;
    if (id && !nome) {
        try {
            const v = await prisma.vendedor.findUnique({ where: { id }, select: { nome: true } });
            nome = v?.nome || null;
        } catch (e) {
            console.error('[Canhoto] Falha ao resolver o nome do usuário:', e.message);
        }
    }
    return { id, nome };
}

/** Período obrigatório 'YYYY-MM-DD'. Devolve null quando algum lado não bate. */
function lerPeriodo(req) {
    const de = String(req.query.de || req.body?.de || '').trim();
    const ate = String(req.query.ate || req.body?.ate || '').trim();
    const ok = /^\d{4}-\d{2}-\d{2}$/;
    if (!ok.test(de) || !ok.test(ate) || de > ate) return null;
    return { de, ate };
}

/**
 * Resposta do `/periodo` quando não veio período utilizável.
 *
 * A aba esconde o preset "Todo o período", então na prática isto não acontece — mas
 * uma tela NUNCA pode quebrar por um caminho que não previmos. Devolve 200 com a MESMA
 * estrutura de sempre, tudo zerado, e um `aviso` para a tela mostrar em português.
 */
function periodoVazio() {
    return {
        de: null,
        ate: null,
        modo: canhotoConfig.PADRAO.modo,
        diasAlerta: canhotoConfig.PADRAO.diasAlerta,
        competencia: null,
        pastaFisica: null,
        periodoCruzaMeses: false,
        curados: 0,
        contadores: {
            total: 0, aguardando: 0, desconhecido: 0, recebido: 0, arquivado: 0,
            semAssinatura: 0, semCanhoto: 0, pendentes: 0, noArquivo: 0, devolucaoAReimprimir: 0,
        },
        alerta: [],
        itens: [],
        truncado: false,
        aviso: 'Escolha um mês para ver o arquivo de canhotos.',
    };
}

// ── Configuração (a chave liga/desliga) ──────────────────────────────────────

// GET /api/canhotos/config — qualquer autenticado (a tela precisa saber se mostra o card)
router.get('/config', async (req, res) => {
    try {
        const cfg = await canhotoConfig.get();
        res.json({ ...cfg, modos: canhotoConfig.MODOS, podeConfigurar: !!perms(req).admin });
    } catch (e) {
        console.error('[Canhoto] config:', e);
        // Banco fora do ar não pode virar trava nem tela quebrada: devolve o padrão.
        res.json({ ...canhotoConfig.PADRAO, modos: canhotoConfig.MODOS, podeConfigurar: false, degradado: true });
    }
});

// PUT /api/canhotos/config — { modo, diasAlerta }
router.put('/config', checkAdmin, async (req, res) => {
    try {
        const { modo, diasAlerta } = req.body || {};
        const parcial = {};
        if (modo !== undefined) parcial.modo = String(modo).toUpperCase();
        if (diasAlerta !== undefined) parcial.diasAlerta = diasAlerta;
        const cfg = await canhotoConfig.salvar(parcial);
        res.json({ ok: true, ...cfg, modos: canhotoConfig.MODOS });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// ── Bipe ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/canhotos/bipar
 * { texto, contexto: 'CAIXA'|'MUTIRAO', origem: 'LEITOR'|'CAMERA'|'NUMERO', de?, ate?, caixaDiarioId? }
 *
 * Sempre 200 no caminho normal:
 *   { ok:true, jaEstava:false, canhoto }        → bipou agora
 *   { ok:true, jaEstava:true,  canhoto }        → já estava (bipe repetido do mutirão)
 *   { ok:false, motivo:'NAO_ENCONTRADA'|'DV_INVALIDO'|'INVALIDO'|'AMBIGUO', mensagem }
 */
router.post('/bipar', checkBipar, async (req, res) => {
    try {
        const { texto, contexto, origem, de, ate, caixaDiarioId } = req.body || {};
        if (!String(texto || '').trim()) {
            return res.json({ ok: false, motivo: 'INVALIDO', mensagem: 'Nada foi lido. Bipe o código de barras ou digite o número da nota.' });
        }
        const usuario = await usuarioDaRequisicao(req);
        const r = await canhoto.bipar({ texto, usuario, contexto, origem, de, ate, caixaDiarioId });
        res.json(r);
    } catch (e) {
        console.error('[Canhoto] bipar:', e);
        res.status(500).json({ ok: false, motivo: 'ERRO', error: e.message });
    }
});

// POST /api/canhotos/arquivar — { chaves: [...] } (aceita string única)
router.post('/arquivar', checkBipar, async (req, res) => {
    try {
        const chaves = req.body?.chaves ?? req.body?.chave;
        if (!chaves) return res.status(400).json({ error: 'Informe as chaves a arquivar.' });
        const usuario = await usuarioDaRequisicao(req);
        const r = await canhoto.arquivar({ chaves, usuario });
        res.json({ ok: true, ...r });
    } catch (e) {
        console.error('[Canhoto] arquivar:', e);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/canhotos/sem-assinatura — { chave, observacao? }
// O papel voltou, mas o canhoto veio em branco: fica no arquivo e não serve de prova.
router.post('/sem-assinatura', checkBipar, async (req, res) => {
    try {
        const { chave, observacao } = req.body || {};
        if (!chave) return res.status(400).json({ error: 'Informe a chave da nota.' });
        const usuario = await usuarioDaRequisicao(req);
        const r = await canhoto.marcarSemAssinatura({ chave, usuario, observacao });
        res.json(r); // { ok:false, motivo } no caminho normal — nunca 500
    } catch (e) {
        console.error('[Canhoto] sem-assinatura:', e);
        res.status(500).json({ error: e.message });
    }
});

// ── Arquivo do mês ───────────────────────────────────────────────────────────

// GET /api/canhotos/periodo?de=&ate=&status=&busca=
// status: todos | pendentes | arquivo | AGUARDANDO | DESCONHECIDO | RECEBIDO | ARQUIVADO | SEM_ASSINATURA | SEM_CANHOTO
router.get('/periodo', checkNotas, async (req, res) => {
    try {
        const periodo = lerPeriodo(req);
        // Período vazio/inválido NÃO devolve erro seco — a aba mostraria tela quebrada.
        if (!periodo) return res.json(periodoVazio());
        const r = await canhoto.listarPeriodo({
            ...periodo,
            status: req.query.status,
            busca: req.query.busca,
            // a auto-cura pode ser desligada pelo chamador (diagnóstico/telas rápidas)
            autocura: req.query.autocura !== '0',
        });
        res.json(r);
    } catch (e) {
        console.error('[Canhoto] periodo:', e);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/canhotos/backfill — { de, ate } · "Colocar o mês em dia" (mutirão)
// Idempotente: rodar de novo devolve criados: 0.
router.post('/backfill', checkNotas, async (req, res) => {
    try {
        const periodo = lerPeriodo(req);
        if (!periodo) return res.status(400).json({ error: 'Informe o período (de/ate) no formato YYYY-MM-DD.' });
        const r = await canhoto.backfill(periodo);
        // O mutirão manual é a autoridade: zera a memória da auto-cura para a próxima
        // carga da aba refletir o que acabou de ser feito (importante quando `truncado`).
        canhoto.limparMemoriaAutocura();
        res.json({ ok: true, ...r });
    } catch (e) {
        console.error('[Canhoto] backfill:', e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
