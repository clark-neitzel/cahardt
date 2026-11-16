// Guarda de /uploads: fecha com login as pastas sensíveis que antes abriam sem autenticação.
// Montado em index.js ANTES do express.static('/uploads').
//
//  - xml-nfe, backfill-cidades ........ 403 sempre (só leitura pelo servidor/rotas autenticadas)
//  - funcionarios/** ................... precisa de login (Bearer) ou ?mt=<token de mídia>;
//                                        EXCEÇÃO: funcionarios/<id>/foto-* continua público (tablet do Como Fazer)
//  - curriculos/** ..................... idem + ?mt= de edição do candidato (tipo curriculo_edit),
//                                        restrito ao arquivo da foto do PRÓPRIO candidato (cpf do token)
//
// O token de mídia (tipo 'midia', 12h) é emitido por GET /api/auth/midia-token e NÃO vale como login.
const path = require('path');
const jwt = require('jsonwebtoken');
const prisma = require('../config/database');
const JWT_SECRET = require('../config/jwtSecret');

const PASTAS_BLOQUEADAS = new Set(['xml-nfe', 'backfill-cidades']);
const PASTAS_COM_LOGIN = new Set(['funcionarios', 'curriculos']);

const negar = (res) => res.status(403).json({ error: 'Acesso negado.' });

// cache curto: uid -> { ok, ate }  (evita consultar o banco a cada imagem)
const CACHE_MS = 60 * 1000;
const cacheUsuarios = new Map();
async function usuarioAtivo(uid) {
    const id = typeof uid === 'string' ? uid : '';
    if (!id || id.length > 100) return false; // Vendedor.id é String (UUID do CA)
    const hit = cacheUsuarios.get(id);
    if (hit && hit.ate > Date.now()) return hit.ok;
    let ok = false;
    try {
        const v = await prisma.vendedor.findUnique({ where: { id }, select: { ativo: true } });
        ok = !!v && v.ativo !== false;
    } catch (e) {
        console.error('[uploadsProtegidos] falha ao consultar usuário:', e.message);
        return false; // na dúvida, nega
    }
    if (cacheUsuarios.size > 500) cacheUsuarios.clear();
    cacheUsuarios.set(id, { ok, ate: Date.now() + CACHE_MS });
    return ok;
}

// Decodifica e normaliza como o express.static faria, para não haver divergência (maiúsculas, %2e%2e, //, /../).
function normalizar(rawPath) {
    let dec;
    try { dec = decodeURIComponent(rawPath); } catch { return null; }
    if (dec.includes('\0')) return null;
    dec = dec.replace(/\\/g, '/');
    const norm = path.posix.normalize('/' + dec).replace(/^\/+/, '');
    if (norm === '..' || norm.startsWith('../')) return null;
    return norm.split('/').filter(Boolean);
}

async function uploadsProtegidos(req, res, next) {
    try {
        const partes = normalizar(req.path);
        if (partes === null) return negar(res);
        if (!partes.length) return next();
        const pasta = partes[0].toLowerCase(); // FS do Mac é case-insensitive; compara em minúsculas

        if (PASTAS_BLOQUEADAS.has(pasta)) return negar(res);
        if (!PASTAS_COM_LOGIN.has(pasta)) return next();

        // Foto de funcionário: funcionarios/<id>/foto-<...> (exatamente 3 segmentos) segue pública
        if (pasta === 'funcionarios' && partes.length === 3 && partes[2].toLowerCase().startsWith('foto-')) {
            return next();
        }

        let liberado = false;

        // 1) Login normal (Bearer) — nunca aceita token de mídia/curriculo_edit aqui
        const h = req.headers.authorization || '';
        if (h.startsWith('Bearer ')) {
            try {
                const d = jwt.verify(h.slice(7), JWT_SECRET, { algorithms: ['HS256'] });
                if (!d.tipo && d.id != null && await usuarioAtivo(d.id)) liberado = true;
            } catch { /* token inválido: segue para ?mt= */ }
        }

        // 2) ?mt=
        const mt = typeof req.query.mt === 'string' ? req.query.mt : '';
        if (!liberado && mt) {
            try {
                const d = jwt.verify(mt, JWT_SECRET, { algorithms: ['HS256'] });
                if (d.tipo === 'midia' && await usuarioAtivo(d.uid)) {
                    liberado = true;
                } else if (d.tipo === 'curriculo_edit' && pasta === 'curriculos' && partes.length === 2 && d.cpf) {
                    // só o arquivo da foto do próprio candidato
                    const c = await prisma.curriculo.findUnique({ where: { cpf: String(d.cpf) }, select: { foto: true } });
                    if (c && c.foto && path.posix.basename(c.foto) === partes[1]) liberado = true;
                }
            } catch { /* expirado/adulterado */ }
        }

        if (!liberado) return negar(res);
        res.set('Cache-Control', 'private, max-age=3600');
        return next();
    } catch (e) {
        console.error('[uploadsProtegidos]', e);
        return negar(res);
    }
}

module.exports = uploadsProtegidos;
