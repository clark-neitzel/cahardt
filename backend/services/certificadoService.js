/**
 * Certificado Digital A1 (.pfx/.p12) — Fase 1: armazenamento seguro.
 *
 * - Valida o arquivo abrindo o PFX com a senha (node-forge).
 * - Extrai titular (CN), CNPJ (CN "RAZAO:CNPJ" ou otherName ICP-Brasil 2.16.76.1.3.3),
 *   emissor e validade.
 * - Criptografa o .pfx e a senha com AES-256-GCM antes de persistir.
 *   Chave = sha256(CERT_ENC_KEY || JWT_SECRET).
 *
 * A captura de notas na SEFAZ (uso do certificado) é Fase 2 — este serviço já
 * expõe descriptografarCertificado() para quando ela chegar.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const forge = require('node-forge');

const CERT_DIR = path.join(__dirname, '..', 'uploads', 'certificado');

// Mesma env do auth (middlewares/authMiddleware.js usa JWT_SECRET)
const _chave = () => crypto
    .createHash('sha256')
    .update(process.env.CERT_ENC_KEY || require('../config/jwtSecret'))
    .digest();

// ── Criptografia AES-256-GCM ──────────────────────────────────
// Formato: iv (12 bytes) + authTag (16 bytes) + ciphertext

function criptografarBuffer(buffer) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', _chave(), iv);
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}

function descriptografarBuffer(buffer) {
    const iv = buffer.subarray(0, 12);
    const tag = buffer.subarray(12, 28);
    const data = buffer.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', _chave(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]);
}

const criptografarTexto = (texto) => criptografarBuffer(Buffer.from(texto, 'utf8')).toString('base64');
const descriptografarTexto = (base64) => descriptografarBuffer(Buffer.from(base64, 'base64')).toString('utf8');

// ── Extração de dados do PFX ──────────────────────────────────

/** Procura o CNPJ ICP-Brasil (OID 2.16.76.1.3.3) dentro dos otherName do subjectAltName. */
function _cnpjDoAltName(cert) {
    try {
        const ext = cert.getExtension('subjectAltName');
        if (!ext || !Array.isArray(ext.altNames)) return null;
        for (const alt of ext.altNames) {
            if (alt.type !== 0 || !alt.value) continue; // 0 = otherName
            try {
                const asn1 = forge.asn1.fromDer(forge.util.createBuffer(alt.value));
                const achado = _procurarOidCnpj(asn1);
                if (achado) return achado;
            } catch (_) { /* tenta o próximo */ }
        }
    } catch (_) { /* sem extensão */ }
    return null;
}

/** Caminha na árvore ASN.1 procurando OID 2.16.76.1.3.3 seguido de string com CNPJ (14 dígitos). */
function _procurarOidCnpj(node, contexto = { achouOid: false }) {
    if (!node) return null;
    if (node.type === forge.asn1.Type.OID && typeof node.value === 'string') {
        try {
            if (forge.asn1.derToOid(node.value) === '2.16.76.1.3.3') contexto.achouOid = true;
        } catch (_) { /* ignora */ }
        return null;
    }
    if (typeof node.value === 'string') {
        if (contexto.achouOid) {
            const digitos = node.value.replace(/\D/g, '');
            if (digitos.length === 14) return digitos;
        }
        return null;
    }
    if (Array.isArray(node.value)) {
        for (const filho of node.value) {
            const r = _procurarOidCnpj(filho, contexto);
            if (r) return r;
        }
    }
    return null;
}

/**
 * Abre e valida o PFX com a senha. Lança erro se a senha estiver errada
 * ou o arquivo for inválido.
 * @returns {{ titular, cnpj, emissor, validade: Date }}
 */
function lerCertificado(pfxBuffer, senha) {
    const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfxBuffer.toString('binary')));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, senha); // lança se a senha estiver errada

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
    if (certBags.length === 0) throw new Error('Arquivo não contém certificado.');

    // Preferir o certificado da chave privada (localKeyId igual ao do keyBag);
    // fallback: primeiro cert que não seja autoassinado; fallback final: o primeiro.
    let escolhido = null;
    try {
        const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
        const keyId = keyBags[0]?.attributes?.localKeyId?.[0];
        if (keyId) {
            escolhido = certBags.find((b) => b.attributes?.localKeyId?.[0] === keyId);
        }
    } catch (_) { /* fallback abaixo */ }
    if (!escolhido) {
        escolhido = certBags.find((b) => {
            const c = b.cert;
            if (!c) return false;
            const subj = c.subject.getField('CN')?.value || '';
            const issu = c.issuer.getField('CN')?.value || '';
            return subj && subj !== issu;
        }) || certBags[0];
    }

    const cert = escolhido.cert;
    if (!cert) throw new Error('Não foi possível ler o certificado do arquivo.');

    const cnRaw = cert.subject.getField('CN')?.value || 'Titular desconhecido';

    // ICP-Brasil PJ: CN costuma ser "RAZAO SOCIAL:CNPJ"
    let titular = cnRaw;
    let cnpj = null;
    const partes = cnRaw.split(':');
    if (partes.length > 1) {
        const possivel = partes[partes.length - 1].replace(/\D/g, '');
        if (possivel.length === 14) {
            cnpj = possivel;
            titular = partes.slice(0, -1).join(':').trim();
        }
    }
    if (!cnpj) cnpj = _cnpjDoAltName(cert);
    if (!cnpj) {
        // Último recurso: serialNumber do subject com 14 dígitos
        const serial = cert.subject.getField({ name: 'serialNumber' })?.value || '';
        const digitos = String(serial).replace(/\D/g, '');
        if (digitos.length === 14) cnpj = digitos;
    }

    const emissor = cert.issuer.getField('CN')?.value || null;
    const validade = cert.validity?.notAfter || null;
    if (!validade) throw new Error('Certificado sem data de validade legível.');

    return { titular, cnpj: cnpj || '', emissor, validade };
}

// ── Persistência ──────────────────────────────────────────────

/**
 * Valida, criptografa e salva o certificado em uploads/certificado/.
 * @returns {{ arquivoPath, senhaCriptografada, titular, cnpj, emissor, validade }}
 */
function salvarCertificado(pfxBuffer, senha) {
    const dados = lerCertificado(pfxBuffer, senha); // lança se senha errada/arquivo inválido

    if (!fs.existsSync(CERT_DIR)) fs.mkdirSync(CERT_DIR, { recursive: true });
    const nomeArquivo = `certificado-${Date.now()}.pfx.enc`;
    const destino = path.join(CERT_DIR, nomeArquivo);
    fs.writeFileSync(destino, criptografarBuffer(pfxBuffer));

    return {
        arquivoPath: path.posix.join('uploads', 'certificado', nomeArquivo),
        senhaCriptografada: criptografarTexto(senha),
        ...dados
    };
}

/**
 * (Fase 2) Devolve o PFX descriptografado + senha em claro, para uso na SEFAZ.
 */
function descriptografarCertificado(registro) {
    const caminho = path.isAbsolute(registro.arquivoPath)
        ? registro.arquivoPath
        : path.join(__dirname, '..', registro.arquivoPath);
    const pfx = descriptografarBuffer(fs.readFileSync(caminho));
    const senha = descriptografarTexto(registro.senhaCriptografada);
    return { pfx, senha };
}

/**
 * Alerta proativo de validade do certificado A1.
 * Sem isto, só se descobre que venceu quando a captura de NF-e para em silêncio.
 * Avisa os ADMINS (com telefone) por WhatsApp nos limiares 30/15/7/3/1 dias e quando vencido.
 * Dedupe por dia via app_config 'cert_alerta_ultimo' (não repete o mesmo aviso no mesmo dia).
 */
async function alertarValidadeCertificado() {
    const prisma = require('../config/database');
    const webhookService = require('./webhookService');

    const cert = await prisma.certificadoDigital.findFirst({
        where: { ativo: true },
        orderBy: { validade: 'desc' }
    });
    if (!cert) return { ok: true, motivo: 'sem certificado ativo', alertado: false };

    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const val = new Date(cert.validade); val.setHours(0, 0, 0, 0);
    const dias = Math.round((val - hoje) / 86400000);

    const LIMIARES = [30, 15, 7, 3, 1];
    if (dias > 0 && !LIMIARES.includes(dias)) return { ok: true, dias, alertado: false };

    // Dedupe: não repetir o mesmo aviso (mesmo dia-restante) no mesmo dia
    const hojeStr = new Date().toISOString().slice(0, 10);
    const cfg = await prisma.appConfig.findUnique({ where: { key: 'cert_alerta_ultimo' } });
    const ultimo = cfg?.value || {};
    if (ultimo.dia === hojeStr && ultimo.dias === dias) return { ok: true, dias, alertado: false, motivo: 'já alertado hoje' };

    const dataFmt = val.toLocaleDateString('pt-BR');
    const msg = dias <= 0
        ? `🚨 *Certificado digital A1 VENCIDO* (${dataFmt}).\n\nA captura automática de NF-e/NFS-e está PARADA. Renove o certificado e reenvie em *Configurações → Notas*.`
        : `⚠️ *Certificado digital A1 vence em ${dias} dia(s)* (${dataFmt}).\n\nRenove antes para não interromper a captura de notas fiscais.`;

    // Destino: admins ativos com telefone
    const vends = await prisma.vendedor.findMany({
        where: { ativo: true, telefone: { not: null } },
        select: { nome: true, telefone: true, permissoes: true }
    });
    const admins = vends.filter(v => {
        const p = typeof v.permissoes === 'string' ? JSON.parse(v.permissoes) : (v.permissoes || {});
        return p && p.admin === true && v.telefone;
    });

    let enviados = 0;
    for (const a of admins) {
        try {
            const r = await webhookService.enviarMensagemCustom(a.telefone, a.nome, msg);
            if (r.ok) enviados++;
        } catch (e) { console.error('[Cert] falha ao alertar', a.nome, e.message); }
    }

    await prisma.appConfig.upsert({
        where: { key: 'cert_alerta_ultimo' },
        update: { value: { dia: hojeStr, dias } },
        create: { key: 'cert_alerta_ultimo', value: { dia: hojeStr, dias } }
    });
    console.log(`[Cert] Alerta de validade (${dias}d, vence ${dataFmt}) enviado a ${enviados}/${admins.length} admin(s).`);
    return { ok: true, dias, alertado: true, enviados, admins: admins.length };
}

module.exports = { lerCertificado, salvarCertificado, descriptografarCertificado, alertarValidadeCertificado };
