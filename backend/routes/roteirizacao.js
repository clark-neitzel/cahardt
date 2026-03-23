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
            return res.json({ sequencia: [], semGPS: [], resumo: { totalParadas: 0, totalSemGPS: 0, duracaoTotalMin: 0, distanciaTotalKm: '0.0', motorista: '' } });
        }

        let responsavelNome = '';
        if (pedidos[0].embarque?.responsavelId) {
            const vend = await prisma.vendedor.findUnique({
                where: { id: pedidos[0].embarque.responsavelId },
                select: { nome: true }
            });
            if (vend) responsavelNome = vend.nome;
        }

        // 5. Separar pedidos: prioridade (com GPS), normais (com GPS), sem GPS
        const comPrioridade = [];
        const semPrioridade = [];
        const semGPS = [];

        for (const p of pedidos) {
            const gps = parsePontoGPS(p.cliente?.Ponto_GPS);
            if (p.prioridadeEntrega) {
                if (gps) {
                    comPrioridade.push({ pedido: p, gps });
                } else {
                    // Prioridade sem GPS: avisa e tira a prioridade para não travar
                    semGPS.push(p);
                }
            } else if (gps) {
                semPrioridade.push({ pedido: p, gps });
            } else {
                semGPS.push(p);
            }
        }

        // Ordenar prioridades na sequência definida pelo motorista
        comPrioridade.sort((a, b) => a.pedido.prioridadeEntrega - b.pedido.prioridadeEntrega);

        // Reordenar prioridades se houver gaps (ex: 1,3 → 1,2)
        for (let i = 0; i < comPrioridade.length; i++) {
            if (comPrioridade[i].pedido.prioridadeEntrega !== i + 1) {
                await prisma.pedido.update({
                    where: { id: comPrioridade[i].pedido.id },
                    data: { prioridadeEntrega: i + 1 }
                });
                comPrioridade[i].pedido.prioridadeEntrega = i + 1;
            }
        }

        const comGPS = [...comPrioridade, ...semPrioridade];

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

        // 6. Construir a rota respeitando prioridades
        // Lógica: Motorista → Prioridade1 → ... → PrioridadeN → [OSRM otimiza restante] → Base
        let listaFinalOrdenada;

        if (semPrioridade.length === 0) {
            // Só tem prioridades (ou só 1 entrega) — ordem já está definida
            listaFinalOrdenada = comPrioridade;
        } else if (comPrioridade.length === 0) {
            // Sem prioridades — usa OSRM Trip API para otimizar tudo (fluxo original)
            listaFinalOrdenada = null; // será resolvido abaixo
        } else {
            // Misto: prioridades fixas + restante otimizado pelo OSRM
            // Ponto de partida para o restante = último cliente prioridade
            const ultimaPrioridade = comPrioridade[comPrioridade.length - 1];

            if (semPrioridade.length === 1) {
                // Só 1 restante, nada pra otimizar
                listaFinalOrdenada = [...comPrioridade, ...semPrioridade];
            } else {
                // OSRM Trip API para otimizar o restante, partindo do último prioridade
                const restCoords = [
                    `${ultimaPrioridade.gps.lng},${ultimaPrioridade.gps.lat}`,
                    ...semPrioridade.map(({ gps }) => `${gps.lng},${gps.lat}`),
                    `-48.91079499767414,-26.189979385982618`
                ].join(';');

                const tripUrl = `${OSRM_URL}/trip/v1/driving/${restCoords}`;
                console.log(`[OSRM] Trip API para restante (${semPrioridade.length} paradas): ${tripUrl}`);

                let tripData;
                try {
                    const tripRes = await axios.get(tripUrl, { timeout: 10000 });
                    tripData = tripRes.data;
                } catch (err) {
                    console.error('[OSRM] Erro Trip API (restante):', err.message);
                    // Fallback: concatena sem otimização
                    listaFinalOrdenada = [...comPrioridade, ...semPrioridade];
                    tripData = null;
                }

                if (tripData && tripData.code === 'Ok' && tripData.waypoints) {
                    const tripOrder = [];
                    for (let i = 0; i < tripData.waypoints.length; i++) {
                        tripOrder[tripData.waypoints[i].waypoint_index] = i;
                    }
                    const startIdx = tripOrder.indexOf(0); // Index do último prioridade
                    const baseIdx = semPrioridade.length + 1; // Index da base

                    let forwardOrder = [];
                    let reverseOrder = [];
                    for (let i = 1; i < tripOrder.length; i++) {
                        forwardOrder.push(tripOrder[(startIdx + i) % tripOrder.length]);
                        reverseOrder.push(tripOrder[(startIdx - i + tripOrder.length) % tripOrder.length]);
                    }

                    const fBaseIdx = forwardOrder.indexOf(baseIdx);
                    const rBaseIdx = reverseOrder.indexOf(baseIdx);
                    const bestOrder = rBaseIdx > fBaseIdx ? reverseOrder : forwardOrder;
                    const clientesOrder = bestOrder.filter(idx => idx !== baseIdx && idx !== 0);

                    const restOrdenado = clientesOrder.map(idx => semPrioridade[idx - 1]);
                    listaFinalOrdenada = [...comPrioridade, ...restOrdenado];
                } else if (!listaFinalOrdenada) {
                    listaFinalOrdenada = [...comPrioridade, ...semPrioridade];
                }
            }
        }

        // Se listaFinalOrdenada ainda é null, usar OSRM Trip para tudo (sem prioridades)
        if (!listaFinalOrdenada) {
            const coordsString = [
                `${lng},${lat}`,
                ...comGPS.map(({ gps }) => `${gps.lng},${gps.lat}`),
                `-48.91079499767414,-26.189979385982618`
            ].join(';');

            if (comGPS.length === 1) {
                // Rota direta
                listaFinalOrdenada = comGPS;
            } else {
                const tripUrl = `${OSRM_URL}/trip/v1/driving/${coordsString}`;
                console.log(`[OSRM] Trip API para otimizar todas (${comGPS.length} paradas): ${tripUrl}`);

                let tripData;
                try {
                    const tripRes = await axios.get(tripUrl, { timeout: 10000 });
                    tripData = tripRes.data;
                } catch (err) {
                    console.error('[OSRM] Erro Trip API:', err.message);
                    releaseLock();
                    return res.status(502).json({ error: 'Erro Trip API', detalhe: err.message });
                }

                if (tripData.code !== 'Ok' || !tripData.waypoints) {
                    releaseLock();
                    return res.status(502).json({ error: 'OSRM retornou Trip inválida.' });
                }

                const tripOrder = [];
                for (let i = 0; i < tripData.waypoints.length; i++) {
                    tripOrder[tripData.waypoints[i].waypoint_index] = i;
                }
                const startIdx = tripOrder.indexOf(0);
                const baseOriginalIndex = comGPS.length + 1;

                let forwardOrder = [];
                let reverseOrder = [];
                for (let i = 1; i < tripOrder.length; i++) {
                    forwardOrder.push(tripOrder[(startIdx + i) % tripOrder.length]);
                    reverseOrder.push(tripOrder[(startIdx - i + tripOrder.length) % tripOrder.length]);
                }

                const fBaseIdx = forwardOrder.indexOf(baseOriginalIndex);
                const rBaseIdx = reverseOrder.indexOf(baseOriginalIndex);
                const bestOrder = rBaseIdx > fBaseIdx ? reverseOrder : forwardOrder;
                const clientesOrder = bestOrder.filter(idx => idx !== baseOriginalIndex && idx !== 0);
                listaFinalOrdenada = clientesOrder.map(idx => comGPS[idx - 1]);
            }
        }

        // 7. Calcular ETAs com Route API (rota exata na ordem final)
        const orderedCoords = [
            `${lng},${lat}`,
            ...listaFinalOrdenada.map(({ gps }) => `${gps.lng},${gps.lat}`),
            `-48.91079499767414,-26.189979385982618`
        ].join(';');

        const routeUrl = `${OSRM_URL}/route/v1/driving/${orderedCoords}?overview=false&annotations=duration,distance`;
        console.log(`[OSRM] Route API para ETAs finais (${listaFinalOrdenada.length} paradas): ${routeUrl}`);

        let routeData;
        try {
            const routeRes = await axios.get(routeUrl, { timeout: 10000 });
            routeData = routeRes.data;
        } catch (err) {
            console.error('[OSRM] Erro Route API:', err.message);
            releaseLock();
            return res.status(502).json({ error: 'Erro Route API', detalhe: err.message });
        }

        if (routeData.code !== 'Ok' || !routeData.routes || routeData.routes.length === 0) {
            releaseLock();
            return res.status(502).json({ error: 'OSRM não encontrou rota.' });
        }

        // 7. Calcular ETAs progressivos exatos
        let horarioAtual = new Date();
        if (horaSaida) {
            const [hh, mm] = horaSaida.split(':').map(Number);
            horarioAtual = new Date();
            horarioAtual.setHours(hh, mm, 0, 0);
        }

        const tempoParadaSegundos = (tempoParadaMin || 10) * 60;
        const rota = routeData.routes[0];
        const legs = rota.legs || []; // Array de percursos exatos de A->B, B->C, etc.

        const sequencia = [];
        const listaClientes = listaFinalOrdenada;

        for (let i = 0; i < listaClientes.length; i++) {
            const clienteEntry = listaClientes[i];
            const leg = legs[i] || {};
            const duracaoTrajetoSeg = leg.duration || 0;
            const distanciaMetros = leg.distance || 0;

            const chegada = new Date(horarioAtual.getTime() + duracaoTrajetoSeg * 1000);
            horarioAtual = new Date(chegada.getTime() + tempoParadaSegundos * 1000);

            sequencia.push({
                sequencia: i + 1,
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
                prioridadeEntrega: clienteEntry.pedido.prioridadeEntrega || null,
                duracaoTrajetoSeg: Math.round(duracaoTrajetoSeg),
                distanciaMetros: Math.round(distanciaMetros),
                duracaoTrajetoMin: Math.round(duracaoTrajetoSeg / 60),
                distanciaKm: (distanciaMetros / 1000).toFixed(1),
                previsaoChegada: formatHorario(chegada),
                previsaoSaida: formatHorario(horarioAtual)
            });
        }

        // Sumário considera o total da Route (que vai perfeitamente até a Base no final) e soma o tempo em que o motorista ficou parado entregando
        const duracaoTotalRota = Math.round((rota.duration || 0) / 60) + ((tempoParadaMin || 10) * listaClientes.length);
        const distanciaTotalRota = ((rota.distance || 0) / 1000).toFixed(1);

        const seq_final = sequencia;
        const sem_final = semGPS.map(p => ({
            pedidoId: p.id,
            numero: p.numero,
            clienteNome: p.cliente?.NomeFantasia || p.cliente?.Nome,
            motivo: 'Sem GPS no cadastro'
        }));
        const resumo_final = {
            totalParadas: sequencia.length,
            totalSemGPS: semGPS.length,
            duracaoTotalMin: duracaoTotalRota,
            distanciaTotalKm: distanciaTotalRota,
            motorista: responsavelNome
        };
        const config_final = { horaSaida, tempoParadaMin, lat, lng };

        // 8. Salvar no banco (Sobrescrevendo a anterior deste vendedorId)
        await prisma.roteirizacao.upsert({
            where: { vendedorId: targetVendedorId },
            update: {
                dadosConfig: config_final,
                sequencia: seq_final,
                semGPS: sem_final,
                resumo: resumo_final
            },
            create: {
                vendedorId: targetVendedorId,
                dadosConfig: config_final,
                sequencia: seq_final,
                semGPS: sem_final,
                resumo: resumo_final
            }
        });

        releaseLock();
        return res.json({
            sequencia: seq_final,
            semGPS: sem_final,
            resumo: resumo_final
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

// ── GET /api/roteirizar ──────────────────────────────────────────────────────
// Retorna a roteirização salva para o vendedor atual logado.
router.get('/', verificarAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const perms = await getPerms(userId);
        const isAdmin = perms.admin || perms.Pode_Ver_Todos_Clientes;

        // Se for admin e passar ID, pode buscar de outro. Senão, busca de si próprio.
        const targetVendedorId = (isAdmin && req.query.vendedorId) ? req.query.vendedorId : userId;

        const rotaSalva = await prisma.roteirizacao.findUnique({
            where: { vendedorId: targetVendedorId }
        });

        if (!rotaSalva) {
            return res.status(204).send(); // 204 No Content se não houver rota salva.
        }

        return res.json({
            sequencia: rotaSalva.sequencia,
            semGPS: rotaSalva.semGPS,
            resumo: rotaSalva.resumo,
            dadosConfig: rotaSalva.dadosConfig,
            updatedAt: rotaSalva.updatedAt
        });
    } catch (error) {
        console.error('[Roteirizacao GET] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar roteirização.' });
    }
});

// ── DELETE /api/roteirizar ───────────────────────────────────────────────────
// Limpa a roteirização do próprio vendedor logado
router.delete('/', verificarAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        // admin can clear someone else's by passing id, otherwise clear own
        const perms = await getPerms(userId);
        const isAdmin = perms.admin || perms.Pode_Ver_Todos_Clientes;
        const targetVendedorId = (isAdmin && req.query.vendedorId) ? req.query.vendedorId : userId;

        await prisma.roteirizacao.deleteMany({
            where: { vendedorId: targetVendedorId }
        });

        return res.json({ success: true });
    } catch (error) {
        console.error('[Roteirizacao DELETE] Erro:', error);
        res.status(500).json({ error: 'Erro ao limpar roteirização.' });
    }
});

// ── GET /api/roteirizar/admin/todas ──────────────────────────────────────────
// Lista todas as roteirizações salvas de todos os vendedores (Visão Admin)
router.get('/admin/todas', verificarAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const perms = await getPerms(userId);
        const isAdmin = perms.admin || perms.Pode_Ver_Todos_Clientes;

        if (!isAdmin) {
            return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
        }

        const rotasSalvas = await prisma.roteirizacao.findMany({
            include: {
                vendedor: { select: { nome: true } }
            },
            orderBy: { updatedAt: 'desc' }
        });

        const formatedData = rotasSalvas.map(r => ({
            vendedorId: r.vendedorId,
            vendedorNome: r.vendedor?.nome || 'Desconhecido',
            resumo: r.resumo,
            updatedAt: r.updatedAt
        }));

        return res.json(formatedData);
    } catch (error) {
        console.error('[Roteirizacao ADMIN GET] Erro:', error);
        res.status(500).json({ error: 'Erro ao buscar todas roteirizações.' });
    }
});

module.exports = router;
