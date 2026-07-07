const prisma = require('../config/database');
const axios = require('axios');

/**
 * Envio de SMS. Config em app_configs chave 'sms_config':
 * { ativo, provider: 'twilio', accountSid, authToken, from }
 * Por enquanto suporta Twilio (contratação à parte). Sem provedor
 * configurado, retorna { ok: false } sem quebrar nada.
 */

async function carregarConfig() {
    try {
        const row = await prisma.appConfig.findUnique({ where: { key: 'sms_config' } });
        return row?.value || {};
    } catch (e) {
        return {};
    }
}

function normalizarTelefone(raw) {
    let phone = (raw || '').replace(/\D/g, '');
    if (phone.length < 10) return null;
    if (!phone.startsWith('55')) phone = '55' + phone;
    return '+' + phone;
}

/** Envia um SMS. Retorna { ok: true } ou { ok: false, motivo }. Nunca lança. */
async function enviar(telefoneRaw, texto) {
    try {
        const cfg = await carregarConfig();
        if (!cfg.ativo) return { ok: false, motivo: 'Envio de SMS desativado nas configurações' };

        const telefone = normalizarTelefone(telefoneRaw);
        if (!telefone) return { ok: false, motivo: 'Telefone inválido para SMS' };

        if (cfg.provider === 'twilio') {
            if (!cfg.accountSid || !cfg.authToken || !cfg.from) {
                return { ok: false, motivo: 'Twilio não configurado (SID/token/número)' };
            }
            const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`;
            const body = new URLSearchParams({ To: telefone, From: cfg.from, Body: texto.slice(0, 640) });
            await axios.post(url, body.toString(), {
                auth: { username: cfg.accountSid, password: cfg.authToken },
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 20000
            });
            console.log(`[SMS] Enviado para ${telefone}`);
            return { ok: true };
        }

        return { ok: false, motivo: `Provedor de SMS não suportado: ${cfg.provider || '(nenhum)'}` };
    } catch (error) {
        const detalhe = error.response?.data?.message || error.message;
        console.error('[SMS] Erro ao enviar:', detalhe);
        return { ok: false, motivo: detalhe };
    }
}

module.exports = { enviar };
