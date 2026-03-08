const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const verificarAuth = require('../middlewares/authMiddleware');
const axios = require('axios');

// ── OSRM URL ──────────────────────────────────────────────────────────────────
// Se o serviço OSRM não estiver configurado, usa o servidor demo público (sem SLA)
const OSRM_URL = process.env.OSRM_URL || 'http://router.project-osrm.org';

// ── Lock de Roteirização (apenas 1 por vez) ───────────────────────────────────
// Estrutura: { vendedorId, iniciadoEm }  |  null (livre)
const LOCK_TIMEOUT_MS = 30 * 1000; // 30 segundos de proteção contra travamento

let lockRoteirizador = null;

const getLock = () => {
    if (!lockRoteirizador) return null;
    // Libera automaticamente se expirou
    if (Date.now() - lockRoteirizador.iniciadoEm > LOCK_TIMEOUT_MS) {
        lockRoteirizador = null;
        return null;
    }
    return lockRoteirizador;
};

const setLock = (vendedorId) => {
    lockRoteirizador = { vendedorId, iniciadoEm: Date.now() };
};

const releaseLock = () => {
    lockRoteirizador = null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const getPerms = async (userId) => {
    const v = await prisma.vendedor.findUnique({ where: { id: userId }, select: { permissoes: true } });
    return typeof v?.permissoes === 'string' ? JSON.parse(v.permissoes) : (v?.permissoes || {});
};

const parsePontoGPS = (pontoGPS) => {
    if (!pontoGPS || typeof pontoGPS !== 'string') return null;
    const parts = pontoGPS.split(',').map(s => parseFloat(s.trim()));
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
    return { lat: parts[0], lng: parts[1] };
};

const formatHorario = (date) => {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
};

// ── POST /api/roteirizar ──────────────────────────────────────────────────────
router.post('/', verificarAuth, async (req, res) => {
    // 1. Verificar lock
    const lockAtual = getLock();
    if (lockAtual) {
        return res.status(423).json({
            error: 'Roteirização em andamento por outro usuário. Aguarde.',
            ocupadoPor: lockAtual.vendedorId,
            iniciadoEm: new Date(lockAtual.iniciadoEm).toISOString()
        });
    }

    const { lat, lng, horaSaida, tempoParadaMin = 10, vendedorId: vendedorIdParam } = req.body;

    if (!lat || !lng) {
        return res.status(400).json({ error: 'Coordenadas GPS do motorista são obrigatórias.' });
    }

    // 2. Checar permissão: admin pode escolher motorista, vendedor só vê o próprio
    const perms = await getPerms(req.user.id);
    const isAdmin = perms.admin || perms.Pode_Ver_Todos_Clientes;
    const targetVendedorId = isAdmin && vendedorIdParam ? vendedorIdParam : req.user.id;

    // 3. Ativar lock
    setLock(targetVendedorId);

    try {
        // 4. Buscar entregas pendentes do motorista — igual ao GET /api/entregas/pendentes
        const pedidos = await prisma.pedido.findMany({
            where: {
                embarqueId: { not: null },
                embarque: { responsavelId: targetVendedorId },
                statusEntrega: 'PENDENTE'
            },
            include: {
                cliente: {
                    select: {
                        UUID: true,
                        NomeFantasia: true,
                        Nome: true,
                        Ponto_GPS: true,
                        End_Logradouro: true,
                        End_Numero: true,
                        End_Cidade: true
                    }
                },
                embarque: { select: { numero: true, responsavelId: true } },
                itens: true
            }
        });

        if (pedidos.length === 0) {
            releaseLock();
            return res.json({ sequencia: [], semGPS: [], resumo: { totalParadas: 0, totalSemGPS: 0, duracaoTotalMin: 0, distanciaTotalKm: '0.0' } });
        }

        // 5. Separar pedidos com e sem GPS no cliente
        const comGPS = [];
        const semGPS = [];

        for (const p of pedidos) {
            const gps = parsePontoGPS(p.cliente?.Ponto_GPS);
            if (gps) {
                comGPS.push({ pedido: p, gps });
            } else {
                semGPS.push(p);
            }
        }

        if (comGPS.length === 0) {
            releaseLock();
            return res.json({
                sequencia: [],
                semGPS: semGPS.map(p => ({
                    pedidoId: p.id,
                    numero: p.numero,
                    clienteNome: p.cliente?.NomeFantasia || p.cliente?.Nome,
                    motivo: 'Sem GPS no cadastro'
                }))
            });
        }

        // 6. Montar query para o OSRM Trip API
        // Formato: lng,lat (OSRM usa longitude primeiro!)
        // Ponto 0 = localização do motorista (source=first)
        const coordsString = [
            `${lng},${lat}`, // ponto de partida do motorista
            ...comGPS.map(({ gps }) => `${gps.lng},${gps.lat}`)
        ].join(';');

        const osrmUrl = `${OSRM_URL}/trip/v1/driving/${coordsString}?roundtrip=false&source=first&annotations=duration,distance`;

        let osrmData;
        try {
            const osrmRes = await axios.get(osrmUrl, { timeout: 10000 });
            osrmData = osrmRes.data;
        } catch (osrmErr) {
            console.error('[OSRM] Erro ao chamar OSRM:', osrmErr.message);
            releaseLock();
            return res.status(502).json({
                error: 'Serviço de roteirização indisponível. Verifique se o OSRM está rodando.',
                detalhe: osrmErr.message
            });
        }

        if (osrmData.code !== 'Ok' || !osrmData.waypoints || !osrmData.trips) {
            releaseLock();
            return res.status(502).json({ error: 'OSRM retornou resposta inválida.', osrmCode: osrmData.code });
        }

        // 7. Ordenar as paradas conforme a resposta do OSRM
        // osrmData.waypoints[i].waypoint_index = posição na rota otimizada
        // waypoints[0] = ponto de partida (motorista) → ignorar
        const waypointsOrdenados = osrmData.waypoints
            .filter(w => w.waypoint_index !== undefined)
            .sort((a, b) => a.waypoint_index - b.waypoint_index);

        // 8. Calcular ETAs progressivos
        // horaSaida pode vir como "HH:MM" ou undefined (usa hora atual)
        let horarioAtual = new Date();
        if (horaSaida) {
            const [hh, mm] = horaSaida.split(':').map(Number);
            horarioAtual = new Date();
            horarioAtual.setHours(hh, mm, 0, 0);
        }

        const tempoParadaSegundos = (tempoParadaMin || 10) * 60;
        const trip = osrmData.trips[0];
        const legs = trip.legs || [];

        // O primeiro leg (idx 0) é do ponto de partida até a 1ª parada
        // waypointsOrdenados[0] = ponto motorista (waypoint_index=0), demais = clientes
        const sequencia = [];
        let legIndex = 0; // leg 0 = motorista → 1ª parada

        for (let i = 1; i < waypointsOrdenados.length; i++) {
            const wp = waypointsOrdenados[i];
            // wp.hint mapeia para o índice original em comGPS (offset -1 pois motorista é idx 0)
            const originalIndex = wp.trips_index !== undefined
                ? comGPS.findIndex((_, idx) => osrmData.waypoints[idx + 1]?.waypoint_index === wp.waypoint_index)
                : i - 1;

            const clienteEntry = comGPS[originalIndex < 0 ? i - 1 : originalIndex];
            if (!clienteEntry) continue;

            const leg = legs[legIndex] || {};
            const duracaoTrajetoSeg = leg.duration || 0;
            const distanciaMetros = leg.distance || 0;

            // Hora de chegada = hora atual + tempo de trajeto
            const chegada = new Date(horarioAtual.getTime() + duracaoTrajetoSeg * 1000);
            // Próxima partida = chegada + tempo médio de parada
            horarioAtual = new Date(chegada.getTime() + tempoParadaSegundos * 1000);

            sequencia.push({
                sequencia: i,
                pedidoId: clienteEntry.pedido.id,
                numero: clienteEntry.pedido.numero,
                clienteId: clienteEntry.pedido.clienteId,
                clienteNome: clienteEntry.pedido.cliente?.NomeFantasia || clienteEntry.pedido.cliente?.Nome,
                endereco: [
                    clienteEntry.pedido.cliente?.End_Logradouro,
                    clienteEntry.pedido.cliente?.End_Numero,
                    clienteEntry.pedido.cliente?.End_Cidade
                ].filter(Boolean).join(', '),
                gps: clienteEntry.gps,
                duracaoTrajetoSeg: Math.round(duracaoTrajetoSeg),
                distanciaMetros: Math.round(distanciaMetros),
                // Formatados para exibição
                duracaoTrajetoMin: Math.round(duracaoTrajetoSeg / 60),
                distanciaKm: (distanciaMetros / 1000).toFixed(1),
                previsaoChegada: formatHorario(chegada),
                previsaoSaida: formatHorario(horarioAtual)
            });

            legIndex++;
        }

        releaseLock();
        return res.json({
            sequencia,
            semGPS: semGPS.map(p => ({
                pedidoId: p.id,
                numero: p.numero,
                clienteNome: p.cliente?.NomeFantasia || p.cliente?.Nome,
                motivo: 'Sem GPS no cadastro'
            })),
            resumo: {
                totalParadas: sequencia.length,
                totalSemGPS: semGPS.length,
                duracaoTotalMin: sequencia.reduce((s, p) => s + p.duracaoTrajetoMin, 0),
                distanciaTotalKm: (sequencia.reduce((s, p) => s + p.distanciaMetros, 0) / 1000).toFixed(1)
            }
        });

    } catch (error) {
        releaseLock();
        console.error('[Roteirizacao] Erro:', error);
        res.status(500).json({ error: 'Erro interno na roteirização.' });
    }
});

// ── GET /api/roteirizar/status ─────────────────────────────────────────────────
// Permite o cliente verificar se há roteirização em andamento
router.get('/status', verificarAuth, (req, res) => {
    const lock = getLock();
    if (lock) {
        return res.json({ ocupado: true, iniciadoEm: new Date(lock.iniciadoEm).toISOString() });
    }
    return res.json({ ocupado: false });
});

module.exports = router;
