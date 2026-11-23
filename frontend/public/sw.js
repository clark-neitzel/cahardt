/*
 * Service Worker do HardtApp.
 *
 * Motivo: o app é usado no iPhone/iPad como atalho na tela inicial (standalone).
 * Nesse modo NÃO existe barra de endereço nem botão de recarregar — se a
 * requisição inicial falhar (4G ruim, elevador, Wi-Fi de cliente), o Safari
 * mostra "não foi possível abrir a página" e o usuário fica preso.
 *
 * Estratégias:
 *  - Navegação (abrir o app): rede primeiro, com limite de 6s; se a rede falhar
 *    ou demorar demais, serve a última casca do app que estiver em cache.
 *    Isso mantém a regra do projeto de sempre pegar a versão nova após deploy
 *    (a rede tem prioridade), mas dá uma rede de segurança quando ela falha.
 *  - /assets/ (nomes com hash, imutáveis): cache primeiro.
 *  - Ícones, manifest e fontes: cache primeiro, revalidando em segundo plano.
 *  - /api: NUNCA interceptado — dado financeiro/pedido sempre vem fresco da rede.
 *
 * OFFLINE GARANTIDO (Separação de Carga / Conferência do motorista — câmara fria e caminhão não têm sinal):
 *  - O vite.config.js grava neste arquivo o id do build (marcador abaixo) e gera /build-info.json com a lista
 *    EXATA dos arquivos (com hash) que as telas offline precisam. Como o sw.js muda a cada build, o navegador
 *    reinstala o service worker a cada deploy.
 *  - install: baixa '/' + build-info.json + todos os "criticos" de uma vez (atômico: se algo falhar, a instalação
 *    é recusada e a versão antiga continua valendo — nunca fica casca nova sem os arquivos dela).
 *  - Toda navegação SPA bem-sucedida regrava '/' (antes só a navegação exatamente a '/', o que deixava o
 *    index.html velho em cache depois do botão de atualizar).
 *  - mensagem GARANTIR_OFFLINE: refaz o que faltar (idempotente) e responde OFFLINE_PRONTO {ok, faltando, buildId}.
 *    Cliente: frontend/src/utils/garantirOffline.js.
 */

const BUILD_ID = '__BUILD_ID__'; // substituído pelo vite.config.js no build
const VERSAO = 'hardt-' + BUILD_ID;
const CACHE_CASCA = `casca-${VERSAO}`;
const CACHE_ASSETS = `assets-${VERSAO}`;
const CACHE_ESTATICOS = `estaticos-${VERSAO}`;

const ORIGENS_FONTES = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];
const TIMEOUT_REDE_MS = 6000;

// Baixa a casca inteira (index.html + build-info + arquivos críticos). Devolve a lista do que faltou.
// O index.html só é gravado POR ÚLTIMO, depois dos arquivos que ele referencia.
async function baixarCasca() {
    const faltando = [];
    const casca = await caches.open(CACHE_CASCA);
    const assets = await caches.open(CACHE_ASSETS);
    let info = null;
    let html = null;
    let buildId = BUILD_ID;
    try {
        const r = await fetch('/build-info.json', { cache: 'no-store' });
        if (r.ok) info = await r.json();
    } catch { /* trata abaixo */ }
    if (!info || !Array.isArray(info.criticos)) {
        faltando.push('/build-info.json');
    } else {
        buildId = info.id || buildId;
        const lista = info.criticos.filter((u) => typeof u === 'string' && u.startsWith('/assets/'));
        const baixar = async (u) => {
            try {
                if (await assets.match(u)) return;
                const r = await fetch(u);
                if (!r.ok) { faltando.push(u); return; }
                await assets.put(u, r);
            } catch { faltando.push(u); }
        };
        for (let i = 0; i < lista.length; i += 6) {
            await Promise.all(lista.slice(i, i + 6).map(baixar));
        }
    }
    try {
        const r = await fetch('/', { cache: 'reload' });
        if (r.ok) html = r; else faltando.push('/');
    } catch { faltando.push('/'); }
    if (html && faltando.length === 0) {
        await casca.put('/', html);
        try { await casca.put('/build-info.json', new Response(JSON.stringify(info), { headers: { 'Content-Type': 'application/json' } })); } catch { /* opcional */ }
    }
    return { faltando, buildId };
}

let garantindo = null;
function garantirOffline() {
    if (!garantindo) {
        garantindo = baixarCasca()
            .catch(() => ({ faltando: ['erro'], buildId: BUILD_ID }))
            .finally(() => { garantindo = null; });
    }
    return garantindo;
}

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const { faltando } = await baixarCasca();
        // Atômico: se faltou algo, recusa esta instalação (a versão antiga continua ativa e tenta no próximo ciclo).
        if (faltando.length) throw new Error('precache incompleto: ' + faltando.slice(0, 5).join(', '));
        await self.skipWaiting();
    })());
});

self.addEventListener('message', (event) => {
    const d = event.data || {};
    if (d.tipo !== 'GARANTIR_OFFLINE') return;
    const responder = (msg) => {
        try { (event.ports && event.ports[0] ? event.ports[0] : event.source).postMessage(msg); } catch { /* aba fechou */ }
    };
    event.waitUntil(garantirOffline().then(({ faltando, buildId }) => {
        responder({ tipo: 'OFFLINE_PRONTO', ok: faltando.length === 0, faltando, buildId });
    }));
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const nomes = await caches.keys();
        await Promise.all(
            nomes.filter((n) => !n.endsWith(VERSAO)).map((n) => caches.delete(n))
        );
        await self.clients.claim();
    })());
});

// Rede com prazo — se estourar, quem chamou decide usar o cache.
function buscarComPrazo(req, ms) {
    return new Promise((resolve, reject) => {
        const id = setTimeout(() => reject(new Error('timeout')), ms);
        fetch(req).then(
            (resp) => { clearTimeout(id); resolve(resp); },
            (err) => { clearTimeout(id); reject(err); }
        );
    });
}

const PAGINA_OFFLINE = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sem conexão</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#f2f0eb;font-family:-apple-system,system-ui,sans-serif;color:rgba(0,0,0,.87);padding:24px}
.c{text-align:center;max-width:320px}h1{font-size:20px;margin:0 0 8px}p{font-size:15px;color:#555;margin:0 0 24px;line-height:1.5}
button{background:#00754A;color:#fff;border:0;border-radius:999px;padding:14px 28px;font-size:15px;font-weight:600}</style>
</head><body><div class="c"><h1>Sem conexão</h1>
<p>Não foi possível abrir o HardtApp. Verifique a internet e tente de novo. (Para usar sem sinal, abra o app uma vez com internet.)</p>
<button onclick="location.reload()">Tentar novamente</button></div></body></html>`;

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    let url;
    try { url = new URL(req.url); } catch { return; }

    const mesmaOrigem = url.origin === self.location.origin;
    const ehFonte = ORIGENS_FONTES.includes(url.origin);
    if (!mesmaOrigem && !ehFonte) return;

    // A API nunca passa pelo cache (Cache-Control: no-store do backend).
    if (mesmaOrigem && url.pathname.startsWith('/api')) return;

    // 1) Abrir o app / trocar de rota: rede primeiro, cache como rede de segurança.
    if (req.mode === 'navigate') {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_CASCA);
            try {
                const resp = await buscarComPrazo(req, TIMEOUT_REDE_MS);
                // Toda navegação SPA (caminho sem extensão: '/', '/separacao-carga'...) traz o mesmo index.html:
                // regrava a casca. Páginas estáticas (novidade-*.html etc.) NÃO entram sob '/'.
                const ultimo = url.pathname.split('/').pop();
                if (resp && resp.ok && !ultimo.includes('.')
                    && /text\/html/i.test(resp.headers.get('Content-Type') || '')) {
                    cache.put('/', resp.clone());
                }
                return resp;
            } catch {
                const salva = (await cache.match(req)) || (await cache.match('/'));
                if (salva) return salva;
                return new Response(PAGINA_OFFLINE, {
                    status: 200,
                    headers: { 'Content-Type': 'text/html; charset=utf-8' },
                });
            }
        })());
        return;
    }

    // 2) /assets/ — nome com hash, conteúdo imutável: cache primeiro.
    if (mesmaOrigem && url.pathname.startsWith('/assets/')) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_ASSETS);
            const salvo = await cache.match(req);
            if (salvo) return salvo;
            const resp = await fetch(req);
            if (resp && resp.ok) cache.put(req, resp.clone());
            return resp;
        })());
        return;
    }

    // 3) Ícones, manifest e fontes: serve do cache e revalida em segundo plano.
    const ehEstatico = ehFonte || url.pathname === '/manifest.json'
        || /\.(png|jpe?g|svg|webp|ico|woff2?)$/i.test(url.pathname);

    if (ehEstatico) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_ESTATICOS);
            const salvo = await cache.match(req);
            const naRede = fetch(req)
                .then((resp) => {
                    if (resp && (resp.ok || resp.type === 'opaque')) cache.put(req, resp.clone());
                    return resp;
                })
                .catch(() => null);
            return salvo || (await naRede) || Response.error();
        })());
    }
});
