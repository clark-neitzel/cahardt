// =====================================================================
// Webhook público da Focus NFe — a Focus faz POST aqui quando um documento
// fiscal muda de status (autorizado, erro, cancelado...).
//
// Autenticação: header `x-focus-secret` (nome/valor cadastrados no painel da
// Focus em Webhooks). O valor esperado vem da env FOCUS_NFE_WEBHOOK_SECRET
// ou, na falta dela, do app_configs `focus_nfe_webhook_secret` (gravado via
// POST /api/admin-exec/focus-nfe-webhook-secret).
//
// Política: responder 2xx rápido e apenas GRAVAR o evento (tabela
// focus_nfe_eventos). Se respondermos fora da família 2xx a Focus reenvia em
// 1min → 30min → 1h → 3h → 24h e depois DESCARTA — por isso qualquer
// processamento pesado fica para depois (worker/módulo de emissão), nunca aqui.
// Contrato completo: backend/docs/focus-nfe-api.md (seção 9).
// =====================================================================
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const prisma = require('../config/database');

// Comparação em tempo constante (mesmo padrão do admin-exec)
function segredoConfere(recebido, esperado) {
    if (typeof recebido !== 'string' || typeof esperado !== 'string') return false;
    const a = crypto.createHash('sha256').update(recebido).digest();
    const b = crypto.createHash('sha256').update(esperado).digest();
    return crypto.timingSafeEqual(a, b);
}

async function segredoEsperado() {
    const env = process.env.FOCUS_NFE_WEBHOOK_SECRET;
    if (env && env.trim()) return env.trim();
    try {
        const cfg = await prisma.appConfig.findUnique({ where: { key: 'focus_nfe_webhook_secret' } });
        const valor = cfg?.value?.secret;
        return (typeof valor === 'string' && valor.trim()) ? valor.trim() : null;
    } catch (e) {
        console.error('[Focus webhook] Erro ao ler segredo do app_configs:', e.message);
        return null;
    }
}

// ── POST /focus-nfe — chamado pela Focus a cada mudança de status ──
router.post('/focus-nfe', async (req, res) => {
    const esperado = await segredoEsperado();
    // Fail-closed: sem segredo configurado, ninguém entra. 401 faz a Focus
    // reagendar o reenvio — quando o segredo for gravado, os eventos chegam.
    if (!esperado || !segredoConfere(String(req.headers['x-focus-secret'] || ''), esperado)) {
        return res.status(401).json({ error: 'Segredo do webhook inválido.' });
    }
    try {
        const b = (req.body && typeof req.body === 'object') ? req.body : {};
        const str = (v) => (v === undefined || v === null) ? null : String(v);
        const evento = await prisma.focusNfeEvento.create({
            data: {
                evento: str(b.evento) || 'nfe',
                ref: str(b.ref),
                cnpjEmitente: str(b.cnpj_emitente),
                status: str(b.status),
                statusSefaz: str(b.status_sefaz),
                mensagemSefaz: str(b.mensagem_sefaz),
                chaveNfe: str(b.chave_nfe),
                numero: str(b.numero),
                serie: str(b.serie),
                payload: b,
            },
        });
        console.log(`[Focus webhook] Evento #${evento.id} gravado — ref=${evento.ref || '?'} status=${evento.status || '?'}`);
        res.json({ ok: true, id: evento.id });
    } catch (e) {
        console.error('[Focus webhook] Erro ao gravar evento:', e.message);
        // 500 → a Focus reenvia depois (não perde o evento)
        res.status(500).json({ error: 'Erro ao gravar evento.' });
    }
});

module.exports = router;
