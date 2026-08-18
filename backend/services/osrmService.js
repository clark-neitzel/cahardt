// ==========================================================================
// Motor OSRM compartilhado (roteirização do motorista + divisão de cargas da
// expedição). Extraído de routes/roteirizacao.js em 08/2026 — comportamento
// idêntico ao original: mesmas URLs, mesmo timeout de 10s, mesmo lock global.
//
// O LOCK É UM SÓ para o processo inteiro: "Organizar Rota" do motorista e a
// sugestão de divisão da expedição competem por ele (um de cada vez; quem
// chegar depois recebe HTTP 423 na rota que o usa).
// ==========================================================================
const axios = require('axios');
const crypto = require('crypto');

// Se o serviço OSRM não estiver configurado, usa o servidor demo público (sem SLA)
const OSRM_URL = process.env.OSRM_URL || 'http://router.project-osrm.org';
const OSRM_TIMEOUT_MS = 10000;

// ── GPS ───────────────────────────────────────────────────────────────────────
const parsePontoGPS = (pontoGPS) => {
    if (!pontoGPS || typeof pontoGPS !== 'string') return null;
    const parts = pontoGPS.split(',').map(s => Number(s.trim()));
    if (parts.length !== 2 || !coordenadaValida({ lat: parts[0], lng: parts[1] })) return null;
    return { lat: parts[0], lng: parts[1] };
};

const coordenadaValida = (ponto) => Boolean(
    ponto && Number.isFinite(Number(ponto.lat)) && Number.isFinite(Number(ponto.lng)) &&
    Number(ponto.lat) >= -90 && Number(ponto.lat) <= 90 &&
    Number(ponto.lng) >= -180 && Number(ponto.lng) <= 180
);

// Base da empresa (Hardt, Joinville). Override por env BASE_EMPRESA_GPS="lat,lng";
// fallback = o valor que estava hardcoded na roteirização do motorista.
const BASE_PADRAO = { lat: -26.189979385982618, lng: -48.91079499767414 };
const BASE_EMPRESA = parsePontoGPS(process.env.BASE_EMPRESA_GPS) || BASE_PADRAO;

// ── Lock global em memória (apenas 1 uso do OSRM por vez) ─────────────────────
// Estrutura: { ownerId, iniciadoEm, ttlMs } | null (livre)
const LOCK_TTL_PADRAO_MS = 30 * 1000; // proteção contra travamento (mesmo valor do original)

let lockOSRM = null;

const getLock = () => {
    if (!lockOSRM) return null;
    // Libera automaticamente se expirou
    if (Date.now() - lockOSRM.iniciadoEm > lockOSRM.ttlMs) {
        lockOSRM = null;
        return null;
    }
    return lockOSRM;
};

// Tenta pegar o lock. Devolve um token exclusivo se conseguiu; false se ocupado.
// O token impede uma operação antiga (cujo TTL venceu) de liberar o lock novo.
const adquirirLock = (ownerId, ttlMs = LOCK_TTL_PADRAO_MS) => {
    if (getLock()) return false;
    const token = crypto.randomUUID();
    lockOSRM = { ownerId, iniciadoEm: Date.now(), ttlMs, token };
    return token;
};

const liberarLock = (token) => {
    if (!lockOSRM || !token || lockOSRM.token !== token) return false;
    lockOSRM = null;
    return true;
};

// ── URLs / wrappers HTTP ──────────────────────────────────────────────────────
// coords sempre no formato OSRM: "lng,lat;lng,lat;..."
const coordsParaString = (pontos) => {
    if (!Array.isArray(pontos) || pontos.length === 0 || pontos.some(p => !coordenadaValida(p))) {
        throw new Error('Coordenadas inválidas para roteirização.');
    }
    return pontos.map(p => `${Number(p.lng)},${Number(p.lat)}`).join(';');
};

const tripUrl = (coordsString, query = '') =>
    `${OSRM_URL}/trip/v1/driving/${coordsString}${query ? `?${query}` : ''}`;

const routeUrl = (coordsString, query = 'overview=false&annotations=duration,distance') =>
    `${OSRM_URL}/route/v1/driving/${coordsString}${query ? `?${query}` : ''}`;

const tableUrl = (coordsString, query = '') =>
    `${OSRM_URL}/table/v1/driving/${coordsString}${query ? `?${query}` : ''}`;

// Cada wrapper devolve o corpo da resposta (res.data). Erros de rede/HTTP sobem
// como exceção do axios — o chamador decide o fallback (igual ao código original).
async function trip(coordsString, query = '') {
    const res = await axios.get(tripUrl(coordsString, query), { timeout: OSRM_TIMEOUT_MS });
    return res.data;
}

async function route(coordsString, query = 'overview=false&annotations=duration,distance') {
    const res = await axios.get(routeUrl(coordsString, query), { timeout: OSRM_TIMEOUT_MS });
    return res.data;
}

// Table API: matriz de durações (segundos) entre todos os pontos.
async function table(coordsString, query = '') {
    const res = await axios.get(tableUrl(coordsString, query), { timeout: OSRM_TIMEOUT_MS });
    return res.data;
}

// ── Distância em linha reta (fallback quando o OSRM está fora) ────────────────
function haversineKm(a, b) {
    const R = 6371; // raio da Terra em km
    const rad = (g) => g * Math.PI / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
}

module.exports = {
    OSRM_URL,
    OSRM_TIMEOUT_MS,
    BASE_EMPRESA,
    coordenadaValida,
    parsePontoGPS,
    coordsParaString,
    tripUrl,
    routeUrl,
    tableUrl,
    trip,
    route,
    table,
    getLock,
    adquirirLock,
    liberarLock,
    haversineKm
};
