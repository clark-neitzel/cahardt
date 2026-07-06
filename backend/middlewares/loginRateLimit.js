// Trava simples de força bruta no login (em memória, por processo).
// Chaveia por IP + login tentado e conta apenas tentativas que FALHAM
// (respostas 401/403). Um login bem-sucedido (200) zera o contador daquela
// chave, então quem digita a senha certa nunca é bloqueado.
//
// Sem dependência externa — mesmo padrão do rate-limit da API de IA.
// (Para múltiplas instâncias, migrar para um store compartilhado.)

const JANELA_MS = 10 * 60 * 1000; // 10 minutos
const MAX_TENTATIVAS = 8;         // falhas permitidas por janela, por IP+login
const mapa = new Map();           // chave -> { count, primeiro }

function chaveDe(req) {
    const ip = req.ip || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'sem-ip';
    const login = String(req.body?.login || '').trim().toLowerCase();
    return `${ip}|${login}`;
}

function loginRateLimit(req, res, next) {
    const chave = chaveDe(req);
    const agora = Date.now();
    const reg = mapa.get(chave);

    if (reg && agora - reg.primeiro < JANELA_MS && reg.count >= MAX_TENTATIVAS) {
        const restaMin = Math.max(1, Math.ceil((JANELA_MS - (agora - reg.primeiro)) / 60000));
        return res.status(429).json({ error: `Muitas tentativas de login. Aguarde ${restaMin} min e tente novamente.` });
    }

    // Ao terminar a resposta: sucesso zera; credencial inválida conta como falha.
    res.on('finish', () => {
        if (res.statusCode === 200) {
            mapa.delete(chave);
        } else if (res.statusCode === 401 || res.statusCode === 403) {
            const r = mapa.get(chave);
            if (!r || agora - r.primeiro >= JANELA_MS) mapa.set(chave, { count: 1, primeiro: agora });
            else r.count += 1;
        }
    });

    next();
}

// Limpeza periódica das chaves expiradas (não segura o processo vivo)
const timer = setInterval(() => {
    const agora = Date.now();
    for (const [k, v] of mapa) if (agora - v.primeiro >= JANELA_MS) mapa.delete(k);
}, JANELA_MS);
if (timer.unref) timer.unref();

module.exports = loginRateLimit;
