/**
 * Backup automático do sistema → Google Drive (conta já conectada p/ XMLs).
 *
 * Camadas (janela de perda ≤ 15 min para o banco):
 *   - BANCO:    pg_dump (formato custom, comprimido) a cada 15 min.
 *   - ARQUIVOS: tar.gz da pasta backend/uploads 1x/dia (madrugada).
 *
 * Estrutura no Drive (raiz configurável em gdrive_config.backupPastaId;
 * por padrão cria "Backup Sistema Hardt" na raiz do Drive):
 *   Backup Sistema Hardt/
 *     ├── Banco 15min/   banco-2026-07-28-1615.dump   (últimas 48 horas)
 *     ├── Banco Diario/  banco-2026-07-28.dump        (últimos 60 dias)
 *     ├── Banco Mensal/  banco-2026-07.dump           (para sempre)
 *     └── Arquivos/      arquivos-2026-07-28.tar.gz   (últimos 30 dias)
 *
 * O arquivo diário/mensal NÃO é re-enviado: é uma cópia server-side (files.copy)
 * do backup de 15 min mais recente daquele dia/mês.
 *
 * Vigilância: status em app_configs.backup_status (lido pela tela de
 * Configurações). Falha 3x seguidas do banco (≈ 45 min sem backup) ou falha do
 * backup diário de arquivos → WhatsApp interno para os admins (máx. 1x/dia).
 *
 * Restauração: ver backend/docs/backup-restauracao.md.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const prisma = require('../config/database');
const gdrive = require('./googleDriveService');

const UPLOADS_DIR = path.join(__dirname, '../uploads'); // → /app/uploads (volume persistente)
const PASTA_RAIZ_NOME = 'Backup Sistema Hardt';
const RETENCAO_15MIN_HORAS = 48;
const RETENCAO_DIARIO_QTD = 60;
const RETENCAO_ARQUIVOS_QTD = 30;
const FALHAS_PARA_ALERTAR = 3;

let _rodandoBanco = false;
let _rodandoUploads = false;

// ── Data/hora no fuso de São Paulo (o container roda em UTC) ─────────────────
function agoraSP() {
    const p = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date()).reduce((a, x) => (a[x.type] = x.value, a), {});
    const hora = p.hour === '24' ? '00' : p.hour; // Intl pode devolver 24:00
    return {
        dia: `${p.year}-${p.month}-${p.day}`,          // 2026-07-28
        mes: `${p.year}-${p.month}`,                    // 2026-07
        horaMin: `${hora}${p.minute}`,                  // 1615
        hora: parseInt(hora, 10),
    };
}

function execAsync(cmd, args, opts = {}) {
    return new Promise((resolve, reject) => {
        execFile(cmd, args, { timeout: opts.timeout || 300000, maxBuffer: 10 * 1024 * 1024, env: opts.env || process.env },
            (err, stdout, stderr) => {
                if (err) reject(new Error(`${cmd}: ${(stderr || err.message || '').toString().slice(0, 500)}`));
                else resolve({ stdout, stderr });
            });
    });
}

// ── Status em app_configs.backup_status ──────────────────────────────────────
async function lerStatus() {
    try {
        const row = await prisma.appConfig.findUnique({ where: { key: 'backup_status' } });
        return row?.value || {};
    } catch { return {}; }
}

async function salvarStatus(status) {
    try {
        await prisma.appConfig.upsert({
            where: { key: 'backup_status' },
            update: { value: status },
            create: { key: 'backup_status', value: status },
        });
    } catch (e) { console.error('[Backup] Falha ao salvar status:', e.message); }
}

// ── Pastas no Drive ──────────────────────────────────────────────────────────
async function pastasBackup(drive) {
    const cfg = await gdrive.carregarConfig();
    const raizId = cfg.backupPastaId || await gdrive.acharOuCriarPasta(drive, PASTA_RAIZ_NOME, 'root');
    const [min15, diario, mensal, arquivos] = await Promise.all([
        gdrive.acharOuCriarPasta(drive, 'Banco 15min', raizId),
        gdrive.acharOuCriarPasta(drive, 'Banco Diario', raizId),
        gdrive.acharOuCriarPasta(drive, 'Banco Mensal', raizId),
        gdrive.acharOuCriarPasta(drive, 'Arquivos', raizId),
    ]);
    return { raizId, min15, diario, mensal, arquivos };
}

async function uploadArquivo(drive, absPath, nome, pastaId) {
    const criado = await drive.files.create({
        requestBody: { name: nome, parents: [pastaId] },
        media: { mimeType: 'application/octet-stream', body: fs.createReadStream(absPath) },
        fields: 'id,size', supportsAllDrives: true,
    });
    return criado.data;
}

// Copia server-side (sem re-upload) se ainda não existir arquivo com esse nome.
async function copiarSeFaltar(drive, origemId, nome, pastaId) {
    const existente = await gdrive.jaExiste(drive, nome, pastaId);
    if (existente) return { pulado: true };
    await drive.files.copy({ fileId: origemId, requestBody: { name: nome, parents: [pastaId] }, supportsAllDrives: true });
    return { copiado: true };
}

async function apagarAntigos(drive, pastaId, { antesDeIso = null, manterQtd = null }) {
    let apagados = 0;
    if (antesDeIso) {
        const q = `'${gdrive.escq(pastaId)}' in parents and trashed = false and createdTime < '${antesDeIso}'`;
        const r = await drive.files.list({ q, fields: 'files(id)', pageSize: 1000, ...gdrive.ALL_DRIVES });
        for (const f of (r.data.files || [])) {
            try { await drive.files.delete({ fileId: f.id, supportsAllDrives: true }); apagados++; } catch { /* segue */ }
        }
    } else if (manterQtd != null) {
        const q = `'${gdrive.escq(pastaId)}' in parents and trashed = false`;
        const r = await drive.files.list({ q, fields: 'files(id,name)', orderBy: 'name desc', pageSize: 1000, ...gdrive.ALL_DRIVES });
        const files = r.data.files || [];
        for (const f of files.slice(manterQtd)) {
            try { await drive.files.delete({ fileId: f.id, supportsAllDrives: true }); apagados++; } catch { /* segue */ }
        }
    }
    return apagados;
}

// ── Alerta de falha (WhatsApp interno p/ admins, máx. 1x/dia) ────────────────
async function alertarFalha(status, tipo, erro) {
    const { dia } = agoraSP();
    if (status.alertaEnviadoDia === dia) return; // já avisou hoje
    try {
        const webhookService = require('./webhookService');
        const vends = await prisma.vendedor.findMany({
            where: { ativo: true, telefone: { not: null } },
            select: { nome: true, telefone: true, permissoes: true },
        });
        const admins = vends.filter(v => {
            const p = typeof v.permissoes === 'string' ? JSON.parse(v.permissoes) : (v.permissoes || {});
            return p && p.admin === true && v.telefone;
        });
        const msg = `🚨 *BACKUP DO SISTEMA FALHANDO*\n\nO backup automático (${tipo}) está falhando desde as últimas tentativas.\n\nErro: ${String(erro || '').slice(0, 200)}\n\nEnquanto isso os dados novos NÃO estão protegidos. Verifique em *Configurações → Backup* ou avise o suporte.`;
        for (const a of admins) {
            try {
                await webhookService.enviarMensagemCustom(a.telefone, a.nome, msg, {
                    tipo: 'interno', // admin da casa, não cliente
                    origem: 'backup',
                    referencia: `backup-falha-${dia}-${a.telefone}`,
                });
            } catch (e) { console.error('[Backup] Falha ao alertar', a.nome, e.message); }
        }
        status.alertaEnviadoDia = dia;
    } catch (e) { console.error('[Backup] Falha no alerta de backup:', e.message); }
}

// ── BANCO: pg_dump → Drive (a cada 15 min) ───────────────────────────────────
async function executarBackupBanco() {
    if (_rodandoBanco) return { ok: false, motivo: 'ja_rodando' };
    _rodandoBanco = true;
    const inicio = Date.now();
    const status = await lerStatus();
    status.banco = status.banco || {};
    let tmp = null;
    try {
        const drive = await gdrive.getDrive();
        if (!drive) throw new Error('Google Drive não configurado (Configurações → Notas)');
        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) throw new Error('DATABASE_URL ausente');

        const { dia, mes, horaMin } = agoraSP();
        tmp = path.join(os.tmpdir(), `backup-banco-${Date.now()}.dump`);

        // Formato custom já sai comprimido; --no-owner/--no-privileges deixam a
        // restauração funcionar em qualquer usuário/servidor Postgres.
        await execAsync('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', tmp, dbUrl], { timeout: 300000 });
        const tamanho = fs.statSync(tmp).size;
        if (tamanho < 100 * 1024) throw new Error(`dump suspeito de vazio (${tamanho} bytes)`); // banco real tem MBs

        const pastas = await pastasBackup(drive);
        const nome15 = `banco-${dia}-${horaMin}.dump`;
        const criado = await uploadArquivo(drive, tmp, nome15, pastas.min15);

        // Promoções (cópia server-side, idempotente): 1º backup do dia vira o
        // diário; 1º do mês vira o mensal.
        await copiarSeFaltar(drive, criado.id, `banco-${dia}.dump`, pastas.diario);
        await copiarSeFaltar(drive, criado.id, `banco-${mes}.dump`, pastas.mensal);

        // Retenção
        const limite15 = new Date(Date.now() - RETENCAO_15MIN_HORAS * 3600000).toISOString();
        await apagarAntigos(drive, pastas.min15, { antesDeIso: limite15 });
        await apagarAntigos(drive, pastas.diario, { manterQtd: RETENCAO_DIARIO_QTD });

        status.banco = {
            ultimoOk: new Date().toISOString(),
            arquivo: nome15,
            tamanhoMB: Math.round(tamanho / 1024 / 1024 * 10) / 10,
            duracaoSeg: Math.round((Date.now() - inicio) / 1000),
            falhasSeguidas: 0,
            ultimoErro: status.banco.ultimoErro || null,
        };
        await salvarStatus(status);
        console.log(`[Backup] Banco → Drive OK: ${nome15} (${status.banco.tamanhoMB} MB, ${status.banco.duracaoSeg}s)`);
        return { ok: true, arquivo: nome15, tamanhoMB: status.banco.tamanhoMB };
    } catch (e) {
        status.banco.falhasSeguidas = (status.banco.falhasSeguidas || 0) + 1;
        status.banco.ultimoErro = e.message;
        status.banco.erroEm = new Date().toISOString();
        console.error(`[Backup] Banco FALHOU (${status.banco.falhasSeguidas}x seguidas):`, e.message);
        if (status.banco.falhasSeguidas >= FALHAS_PARA_ALERTAR) await alertarFalha(status, 'banco de dados', e.message);
        await salvarStatus(status);
        return { ok: false, erro: e.message };
    } finally {
        if (tmp) { try { fs.unlinkSync(tmp); } catch { /* já foi */ } }
        _rodandoBanco = false;
    }
}

// ── ARQUIVOS: tar.gz de backend/uploads → Drive (1x/dia) ─────────────────────
async function executarBackupUploads({ forcar = false } = {}) {
    if (_rodandoUploads) return { ok: false, motivo: 'ja_rodando' };
    _rodandoUploads = true;
    const inicio = Date.now();
    const status = await lerStatus();
    status.uploads = status.uploads || {};
    let tmp = null;
    try {
        const { dia } = agoraSP();
        if (!forcar && status.uploads.dia === dia && status.uploads.ultimoOk) return { ok: true, pulado: true };

        const drive = await gdrive.getDrive();
        if (!drive) throw new Error('Google Drive não configurado (Configurações → Notas)');
        if (!fs.existsSync(UPLOADS_DIR)) throw new Error(`pasta de uploads inexistente: ${UPLOADS_DIR}`);

        const pastas = await pastasBackup(drive);
        const nome = `arquivos-${dia}.tar.gz`;

        // idempotente: se o de hoje já está no Drive, não re-envia
        const existente = await gdrive.jaExiste(drive, nome, pastas.arquivos);
        if (existente && !forcar) {
            status.uploads = { ...status.uploads, dia, ultimoOk: status.uploads.ultimoOk || new Date().toISOString() };
            await salvarStatus(status);
            return { ok: true, pulado: true };
        }

        tmp = path.join(os.tmpdir(), `backup-uploads-${Date.now()}.tar.gz`);
        await execAsync('tar', ['-czf', tmp, '-C', UPLOADS_DIR, '.'], { timeout: 600000 });
        const tamanho = fs.statSync(tmp).size;

        await uploadArquivo(drive, tmp, nome, pastas.arquivos);
        await apagarAntigos(drive, pastas.arquivos, { manterQtd: RETENCAO_ARQUIVOS_QTD });

        status.uploads = {
            dia,
            ultimoOk: new Date().toISOString(),
            arquivo: nome,
            tamanhoMB: Math.round(tamanho / 1024 / 1024 * 10) / 10,
            duracaoSeg: Math.round((Date.now() - inicio) / 1000),
            ultimoErro: status.uploads.ultimoErro || null,
        };
        await salvarStatus(status);
        console.log(`[Backup] Arquivos → Drive OK: ${nome} (${status.uploads.tamanhoMB} MB, ${status.uploads.duracaoSeg}s)`);
        return { ok: true, arquivo: nome, tamanhoMB: status.uploads.tamanhoMB };
    } catch (e) {
        status.uploads.ultimoErro = e.message;
        status.uploads.erroEm = new Date().toISOString();
        console.error('[Backup] Arquivos FALHOU:', e.message);
        await alertarFalha(status, 'arquivos (uploads)', e.message);
        await salvarStatus(status);
        return { ok: false, erro: e.message };
    } finally {
        if (tmp) { try { fs.unlinkSync(tmp); } catch { /* já foi */ } }
        _rodandoUploads = false;
    }
}

// ── Diagnóstico (tela de Configurações e admin-exec) ─────────────────────────
async function statusBackup() {
    const status = await lerStatus();
    let pgDump = null;
    try { pgDump = (await execAsync('pg_dump', ['--version'], { timeout: 10000 })).stdout.trim(); }
    catch (e) { pgDump = `INDISPONÍVEL: ${e.message}`; }
    let servidor = null;
    try { const r = await prisma.$queryRaw`SELECT version()`; servidor = r?.[0]?.version || null; }
    catch (e) { servidor = `erro: ${e.message}`; }
    let driveOk = false;
    try { driveOk = !!(await gdrive.getDrive()); } catch { /* fica false */ }
    return { status, pgDump, servidor, driveConfigurado: driveOk };
}

module.exports = { executarBackupBanco, executarBackupUploads, statusBackup };
