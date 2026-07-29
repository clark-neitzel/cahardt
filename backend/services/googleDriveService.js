/**
 * Google Drive — salvamento automático dos XML das notas na pasta da Contabilidade.
 *
 * Estrutura no Drive (contas Gmail comuns, sem Drive Compartilhado → autenticação
 * via OAuth da conta do usuário; os arquivos ficam no Drive DELE, com o espaço dele):
 *
 *   Envio Contabilidade
 *     └── "Julho 2026"                (pasta do mês da EMISSÃO — criada se faltar)
 *           └── "XML de Julho"        (subpasta de XML — reaproveita a existente ou cria)
 *                 ├── {chave} - Nota {nº} - {Fornecedor}.xml   (nota conferida / dada entrada)
 *                 └── Ignoradas/      (XML de nota ignorada)
 *
 * Credenciais ficam em app_configs (key = 'gdrive_config'), JSON:
 *   { ativo, clientId, clientSecret, refreshToken, envioContabilidadeId }
 * Podem ser sobrepostas por variável de ambiente GDRIVE_CONFIG (mesmo JSON).
 *
 * NADA aqui pode derrubar a operação da nota: toda função é "best-effort" e os
 * erros são apenas logados. Se as credenciais faltarem, o serviço fica inerte.
 */

const fs = require('fs');
const { google } = require('googleapis');
const prisma = require('../config/database');

// ID padrão da pasta "Envio Contabilidade" (pode ser sobreposto pela config).
const ENVIO_CONTABILIDADE_ID_PADRAO = '166d0hUqFgY62HKwF4T2j5r0WIi5NSE8L';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
               'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const ALL_DRIVES = { supportsAllDrives: true, includeItemsFromAllDrives: true };

let _cfgCache = null;
let _cfgCacheAt = 0;
let _drive = null;
let _driveRefreshToken = null; // pra recriar o client se o refresh token mudar

// ── Config (app_configs.gdrive_config, com override por env) ──────────────────
async function carregarConfig() {
    // cache curto (30s) para não bater no banco a cada nota
    if (_cfgCache && Date.now() - _cfgCacheAt < 30000) return _cfgCache;
    let cfg = {};
    try {
        if (process.env.GDRIVE_CONFIG) {
            cfg = JSON.parse(process.env.GDRIVE_CONFIG);
        } else {
            const row = await prisma.appConfig.findUnique({ where: { key: 'gdrive_config' } });
            cfg = row?.value || {};
        }
    } catch (e) {
        console.warn('[GoogleDrive] Falha ao carregar config:', e.message);
        cfg = {};
    }
    _cfgCache = cfg;
    _cfgCacheAt = Date.now();
    return cfg;
}

function estaConfigurado(cfg) {
    return !!(cfg && cfg.ativo && cfg.clientId && cfg.clientSecret && cfg.refreshToken);
}

async function getDrive() {
    const cfg = await carregarConfig();
    if (!estaConfigurado(cfg)) return null;
    if (_drive && _driveRefreshToken === cfg.refreshToken) return _drive;
    const auth = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret);
    auth.setCredentials({ refresh_token: cfg.refreshToken });
    _drive = google.drive({ version: 'v3', auth });
    _driveRefreshToken = cfg.refreshToken;
    return _drive;
}

// ── Helpers de pasta/arquivo ──────────────────────────────────────────────────
const escq = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// Nome de arquivo seguro no Drive (sem barras nem controles), enxuto.
function nomeArquivoSeguro(nome) {
    return String(nome)
        .replace(/[\\/\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
}

// Acha a 1ª pasta filha com determinado nome; cria se não existir.
async function acharOuCriarPasta(drive, nome, paiId) {
    const q = `name = '${escq(nome)}' and '${escq(paiId)}' in parents `
        + `and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const r = await drive.files.list({ q, fields: 'files(id,name)', pageSize: 1, ...ALL_DRIVES });
    if (r.data.files?.length) return r.data.files[0].id;
    const novo = await drive.files.create({
        requestBody: { name: nome, mimeType: 'application/vnd.google-apps.folder', parents: [paiId] },
        fields: 'id', supportsAllDrives: true,
    });
    return novo.data.id;
}

// Subpasta de XML do mês: reaproveita qualquer pasta que comece com "XML"
// (ex.: "XML de Julho", "XML Julho 2026") ou cria "XML de {Mês}".
async function acharOuCriarPastaXml(drive, mesFolderId, mesNome) {
    const q = `'${escq(mesFolderId)}' in parents and mimeType = 'application/vnd.google-apps.folder' `
        + `and name contains 'XML' and trashed = false`;
    const r = await drive.files.list({ q, fields: 'files(id,name)', pageSize: 10, ...ALL_DRIVES });
    if (r.data.files?.length) {
        const xml = r.data.files.find(f => /^xml/i.test(f.name.trim())) || r.data.files[0];
        return xml.id;
    }
    return acharOuCriarPasta(drive, `XML de ${mesNome}`, mesFolderId);
}

async function jaExiste(drive, nome, paiId) {
    const q = `name = '${escq(nome)}' and '${escq(paiId)}' in parents and trashed = false`;
    const r = await drive.files.list({ q, fields: 'files(id,name,webViewLink)', pageSize: 1, ...ALL_DRIVES });
    return r.data.files?.[0] || null;
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Sobe o XML de uma nota para a pasta do mês (por EMISSÃO) na Contabilidade.
 * @param {object} nota  { chave, numero, fornecedorNome, emissao }
 * @param {string} xmlAbsPath  caminho absoluto do .xml no servidor
 * @param {object} [opts]  { ignorada: boolean }
 * @returns {Promise<{ok, motivo?, id?, link?, pulado?}>}
 */
async function salvarXmlNota(nota, xmlAbsPath, opts = {}) {
    try {
        const drive = await getDrive();
        if (!drive) return { ok: false, motivo: 'nao_configurado' };
        if (!xmlAbsPath || !fs.existsSync(xmlAbsPath)) return { ok: false, motivo: 'xml_inexistente' };

        const emissao = nota.emissao ? new Date(nota.emissao) : null;
        if (!emissao || isNaN(emissao.getTime())) return { ok: false, motivo: 'sem_data_emissao' };

        const mesNome = MESES[emissao.getMonth()];
        const mesAno = `${mesNome} ${emissao.getFullYear()}`;           // "Julho 2026"

        const cfg = await carregarConfig();
        const envioId = cfg.envioContabilidadeId || ENVIO_CONTABILIDADE_ID_PADRAO;

        const mesFolderId = await acharOuCriarPasta(drive, mesAno, envioId);
        const xmlFolderId = await acharOuCriarPastaXml(drive, mesFolderId, mesNome);
        const destinoId = opts.ignorada
            ? await acharOuCriarPasta(drive, 'Ignoradas', xmlFolderId)
            : xmlFolderId;

        const fornecedor = (nota.fornecedorNome || 'Fornecedor').trim();
        const numero = nota.numero || 's-n';
        const nomeArquivo = nomeArquivoSeguro(`${nota.chave} - Nota ${numero} - ${fornecedor}.xml`);

        // idempotente: se já existe, não duplica
        const existente = await jaExiste(drive, nomeArquivo, destinoId);
        if (existente) return { ok: true, pulado: true, id: existente.id, link: existente.webViewLink };

        const criado = await drive.files.create({
            requestBody: { name: nomeArquivo, parents: [destinoId] },
            media: { mimeType: 'application/xml', body: fs.createReadStream(xmlAbsPath) },
            fields: 'id,webViewLink', supportsAllDrives: true,
        });
        console.log(`[GoogleDrive] XML salvo em "${mesAno}"${opts.ignorada ? '/Ignoradas' : ''}: ${nomeArquivo}`);
        return { ok: true, id: criado.data.id, link: criado.data.webViewLink };
    } catch (e) {
        console.error('[GoogleDrive] Falha ao salvar XML da nota:', e?.message || e);
        return { ok: false, motivo: 'erro', erro: e?.message };
    }
}

// Teste de credenciais/acesso (usado pela tela de configuração).
async function testarAcesso() {
    try {
        const cfg = await carregarConfig();
        if (!estaConfigurado(cfg)) return { ok: false, motivo: 'nao_configurado' };
        const drive = await getDrive();
        const envioId = cfg.envioContabilidadeId || ENVIO_CONTABILIDADE_ID_PADRAO;
        const meta = await drive.files.get({
            fileId: envioId, fields: 'id,name,capabilities(canAddChildren)', supportsAllDrives: true,
        });
        return { ok: true, pasta: meta.data.name, podeEscrever: !!meta.data.capabilities?.canAddChildren };
    } catch (e) {
        return { ok: false, motivo: 'erro', erro: e?.message };
    }
}

function limparCacheConfig() { _cfgCache = null; _cfgCacheAt = 0; _drive = null; _driveRefreshToken = null; }

module.exports = {
    salvarXmlNota, testarAcesso, limparCacheConfig,
    // helpers de baixo nível reutilizados pelo backupService
    getDrive, carregarConfig, acharOuCriarPasta, jaExiste, nomeArquivoSeguro, escq, ALL_DRIVES,
};
