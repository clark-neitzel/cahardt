const prisma = require('../config/database');

/**
 * Envio de e-mail via SMTP (nodemailer).
 * Config em app_configs chave 'email_config':
 * { ativo, host, port, secure, user, pass, from, fromName }
 * Ex.: Gmail => host smtp.gmail.com, port 465, secure true, pass = senha de app.
 */

let _cfgCache = null;
let _cfgCacheAt = 0;

async function carregarConfig() {
    if (_cfgCache && Date.now() - _cfgCacheAt < 30000) return _cfgCache;
    let cfg = {};
    try {
        const row = await prisma.appConfig.findUnique({ where: { key: 'email_config' } });
        cfg = row?.value || {};
    } catch (e) {
        console.error('[Email] Erro ao carregar config:', e.message);
    }
    _cfgCache = cfg;
    _cfgCacheAt = Date.now();
    return cfg;
}

function limparCacheConfig() {
    _cfgCache = null;
    _cfgCacheAt = 0;
}

/**
 * Envia um e-mail. Retorna { ok: true } ou { ok: false, motivo }.
 * Nunca lança — quem chama decide o que fazer com a falha.
 */
async function enviar(para, assunto, html) {
    try {
        const cfg = await carregarConfig();
        if (!cfg.ativo) return { ok: false, motivo: 'Envio de e-mail desativado nas configurações' };
        if (!cfg.host || !cfg.user || !cfg.pass) return { ok: false, motivo: 'SMTP não configurado (host/usuário/senha)' };
        if (!para || !/\S+@\S+\.\S+/.test(para)) return { ok: false, motivo: 'E-mail do destinatário inválido' };

        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            host: cfg.host,
            port: Number(cfg.port || 465),
            secure: cfg.secure !== false, // 465 = true; 587 = false (STARTTLS)
            auth: { user: cfg.user, pass: cfg.pass },
            connectionTimeout: 20000,
            socketTimeout: 20000
        });

        await transporter.sendMail({
            from: `"${cfg.fromName || 'Hardt Salgados'}" <${cfg.from || cfg.user}>`,
            to: para,
            subject: assunto,
            html
        });
        console.log(`[Email] Enviado para ${para}: ${assunto}`);
        return { ok: true };
    } catch (error) {
        console.error('[Email] Erro ao enviar:', error.message);
        return { ok: false, motivo: error.message };
    }
}

/** Testa a conexão SMTP com as credenciais salvas (sem enviar nada). */
async function testarConexao() {
    try {
        limparCacheConfig();
        const cfg = await carregarConfig();
        if (!cfg.host || !cfg.user || !cfg.pass) return { ok: false, motivo: 'SMTP não configurado (host/usuário/senha)' };
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            host: cfg.host,
            port: Number(cfg.port || 465),
            secure: cfg.secure !== false,
            auth: { user: cfg.user, pass: cfg.pass },
            connectionTimeout: 15000
        });
        await transporter.verify();
        return { ok: true };
    } catch (error) {
        return { ok: false, motivo: error.message };
    }
}

module.exports = { enviar, testarConexao, limparCacheConfig };
