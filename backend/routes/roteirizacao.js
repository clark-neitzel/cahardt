const express = require('express');
const router = express.Router();
const prisma = require('../config/database'); // singleton compartilhado (pool único)
const verificarAuth = require('../middlewares/authMiddleware');

// ── Motor OSRM compartilhado (URLs, lock global, GPS, base da empresa) ────────
// Extraído para services/osrmService.js em 08/2026 — o lock agora é compartilhado
// com a divisão de cargas da expedição (um uso do OSRM por vez; o outro leva 423).
const osrm = require('../services/osrmService');
const { parsePontoGPS } = osrm;

// Coordenada da base no formato OSRM "lng,lat" (mesmo valor hardcoded de antes,
// agora com override por env BASE_EMPRESA_GPS).
const BASE_COORD = `${osrm.BASE_EMPRESA.lng},${osrm.BASE_EMPRESA.lat}`;

// ── Helpers ───────────────────────────────────────────────────────────────────
const getPerms = async (userId) => {
    const v = await prisma.vendedor.findUnique({ where: { id: userId }, select: { permissoes: true } });
    return typeof v?.permissoes === 'string' ? JSON.parse(v.permissoes) : (v?.permissoes || {});
};

const formatHorario = (date) => {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' });
};

// ── POST /api/roteirizar ──────────────────────────────────────────────────────
router.post('/', verificarAuth, async (req, res) => {
    // 1. Verificar lock (compartilhado com a divisão de cargas da expedição)
    const lockAtual = osrm.getLock();
    if (lockAtual) {
        return res.status(423).json({
            error: 'Roteirização em andamento por outro usuário. Aguarde.',
            ocupadoPor: lockAtual.ownerId,
            iniciadoEm: new Date(lockAtual.iniciadoEm).toISOString()
        });
    }

    const { lat, lng, horaSaida, tempoParadaMin = 10, vendedorId: vendedorIdParam } = req.body;

    if (!osrm.coordenadaValida({ lat, lng })) {
        return res.status(400).json({ error: 'Coordenadas GPS do motorista são obrigatórias.' });
    }
    const origemLat = Number(lat);
    const origemLng = Number(lng);

    // 2. Checar permissão: admin pode escolher motorista, vendedor só vê o próprio
    const perms = await getPerms(req.user.id);
    const isAdmin = perms.admin || perms.Pode_Ver_Todos_Clientes;
    const targetVendedorId = isAdmin && vendedorIdParam ? vendedorIdParam : req.user.id;

    // 3. Ativar lock (se alguém pegou entre a checagem acima e aqui, devolve 423 também)
    const lockToken = osrm.adquirirLock(targetVendedorId);
    if (!lockToken) {
        const lockCorrida = osrm.getLock();
        return res.status(423).json({
            error: 'Roteirização em andamento por outro usuário. Aguarde.',
            ocupadoPor: lockCorrida?.ownerId || null,
            iniciadoEm: lockCorrida ? new Date(lockCorrida.iniciadoEm).toISOString() : null
        });
    }

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
            osrm.liberarLock(lockToken);
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
            osrm.liberarLock(lockToken);
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
                    BASE_COORD
                ].join(';');

                console.log(`[OSRM] Trip API para restante (${semPrioridade.length} paradas): ${osrm.tripUrl(restCoords)}`);

                let tripData;
                try {
                    tripData = await osrm.trip(restCoords);
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
                `${origemLng},${origemLat}`,
                ...comGPS.map(({ gps }) => `${gps.lng},${gps.lat}`),
                BASE_COORD
            ].join(';');

            if (comGPS.length === 1) {
                // Rota direta
                listaFinalOrdenada = comGPS;
            } else {
                console.log(`[OSRM] Trip API para otimizar todas (${comGPS.length} paradas): ${osrm.tripUrl(coordsString)}`);

                let tripData;
                try {
                    tripData = await osrm.trip(coordsString);
                } catch (err) {
                    console.error('[OSRM] Erro Trip API:', err.message);
                    osrm.liberarLock(lockToken);
                    return res.status(502).json({ error: 'Erro Trip API', detalhe: err.message });
                }

                if (tripData.code !== 'Ok' || !tripData.waypoints) {
                    osrm.liberarLock(lockToken);
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
            `${origemLng},${origemLat}`,
            ...listaFinalOrdenada.map(({ gps }) => `${gps.lng},${gps.lat}`),
            BASE_COORD
        ].join(';');

        console.log(`[OSRM] Route API para ETAs finais (${listaFinalOrdenada.length} paradas): ${osrm.routeUrl(orderedCoords)}`);

        let routeData;
        try {
            routeData = await osrm.route(orderedCoords);
        } catch (err) {
            console.error('[OSRM] Erro Route API:', err.message);
            osrm.liberarLock(lockToken);
            return res.status(502).json({ error: 'Erro Route API', detalhe: err.message });
        }

        if (routeData.code !== 'Ok' || !routeData.routes || routeData.routes.length === 0) {
            osrm.liberarLock(lockToken);
            return res.status(502).json({ error: 'OSRM não encontrou rota.' });
        }

        // 7. Calcular ETAs progressivos exatos
        // horaSaida é no fuso do usuário (BRT = America/Sao_Paulo).
        // Constrói o Date via string ISO com offset -03:00 para que o timestamp interno seja UTC correto.
        let horarioAtual = new Date();
        if (horaSaida) {
            const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // "YYYY-MM-DD"
            horarioAtual = new Date(`${hoje}T${horaSaida}:00-03:00`);
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
            motorista: responsavelNome,
            // Rota recém-calculada com o OSRM (inclui a volta à base): os totais
            // valem. É AQUI que a marca de "a expedição mexeu na sua carga" some —
            // organizar a rota de novo é a única coisa que refaz os quilômetros.
            // (o recalcular-etas NÃO limpa: ele só reescreve horários, não a rota)
            recalcularNecessario: false
        };
        const config_final = { horaSaida, tempoParadaMin, lat: origemLat, lng: origemLng };

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

        osrm.liberarLock(lockToken);
        return res.json({
            sequencia: seq_final,
            semGPS: sem_final,
            resumo: resumo_final
        });

    } catch (error) {
        osrm.liberarLock(lockToken);
        console.error('[Roteirizacao] Erro:', error);
        res.status(500).json({ error: 'Erro interno na roteirização.' });
    }
});

// ── GET /api/roteirizar/status ─────────────────────────────────────────────────
// Permite o cliente verificar se há roteirização em andamento
router.get('/status', verificarAuth, (req, res) => {
    const lock = osrm.getLock();
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

        // resumo.recalcularNecessario = a expedição remanejou a carga deste
        // motorista depois que ele organizou a rota (marcado pelo
        // POST /api/embarques/aplicar-divisao). Quando isso acontece os totais
        // de km/duração guardados NÃO são recalculados — as pernas salvas não
        // contêm a volta à base, então qualquer soma aqui sairia menor que a
        // verdade. Preferimos manter o número antigo (conservador) e avisar a
        // tela para pedir "Organizar Rota" de novo. Espelhado no topo da
        // resposta para a tela não precisar cavar dentro do resumo.
        const resumo = rotaSalva.resumo;
        return res.json({
            sequencia: rotaSalva.sequencia,
            semGPS: rotaSalva.semGPS,
            resumo,
            recalcularNecessario: resumo?.recalcularNecessario === true,
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

// ── POST /api/roteirizar/recalcular-etas ────────────────────────────────────
// Recalcula APENAS os horários (ETAs) das entregas restantes usando now() como base.
// NÃO recalcula rota, NÃO chama OSRM. Mantém a sequência e os totais do resumo
// (distância E duração) intactos — ver a explicação no cálculo do `resumo` abaixo.
router.post('/recalcular-etas', verificarAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const perms = await getPerms(userId);
        const isAdmin = perms.admin || perms.Pode_Ver_Todos_Clientes;
        const targetVendedorId = (isAdmin && req.body.vendedorId) ? req.body.vendedorId : userId;

        const rotaSalva = await prisma.roteirizacao.findUnique({
            where: { vendedorId: targetVendedorId }
        });

        if (!rotaSalva || !rotaSalva.sequencia?.length) {
            return res.status(204).send();
        }

        const tempoParadaMin = rotaSalva.dadosConfig?.tempoParadaMin || 10;
        const tempoParadaSeg = tempoParadaMin * 60;

        // Buscar quais pedidos da sequência ainda estão PENDENTE
        const pedidoIds = rotaSalva.sequencia.map(s => s.pedidoId);
        const pedidosPendentes = await prisma.pedido.findMany({
            where: { id: { in: pedidoIds }, statusEntrega: 'PENDENTE' },
            select: { id: true }
        });
        const pendentesSet = new Set(pedidosPendentes.map(p => p.id));

        // Filtrar sequência mantendo apenas pendentes, na mesma ordem
        const sequenciaRestante = rotaSalva.sequencia.filter(s => pendentesSet.has(s.pedidoId));

        if (sequenciaRestante.length === 0) {
            // Todas entregues — limpar roteirização
            await prisma.roteirizacao.delete({ where: { vendedorId: targetVendedorId } });
            return res.status(204).send();
        }

        // Filtrar semGPS também
        const semGPSRestante = (rotaSalva.semGPS || []).filter(s => pendentesSet.has(s.pedidoId));

        // Recalcular horários usando agora como base
        let horarioAtual = new Date();

        for (let i = 0; i < sequenciaRestante.length; i++) {
            const item = sequenciaRestante[i];
            const duracaoTrajeto = item.duracaoTrajetoSeg || 0;

            const chegada = new Date(horarioAtual.getTime() + duracaoTrajeto * 1000);
            const saida = new Date(chegada.getTime() + tempoParadaSeg * 1000);

            item.sequencia = i + 1; // Renumerar
            item.previsaoChegada = formatHorario(chegada);
            item.previsaoSaida = formatHorario(saida);

            horarioAtual = saida;
        }

        // Atualizar resumo.
        // ATENÇÃO: o espalhamento preserva de propósito `distanciaTotalKm`,
        // `duracaoTotalMin` e `recalcularNecessario`.
        // Por que a DURAÇÃO TOTAL não é recalculada aqui: cada item da sequência
        // guarda só a perna que CHEGA nele — a perna final (última parada → BASE)
        // não existe em `sequencia[]`, ela só vivia em `rota.duration` na hora do
        // OSRM. Somar as pernas salvas daria um total MENOR que a verdade, e como
        // esta rota roda toda vez que a aba Entregas abre, o número encolhia a cada
        // abertura (medido: 323 → 270 min só reabrindo a aba). Melhor manter o
        // total antigo (correto para a rota que o motorista organizou) do que
        // mostrar um número inventado.
        // Recalcular ETA só reescreve horários com base em agora; NÃO refaz a rota.
        // Quem escreve `duracaoTotalMin`/`distanciaTotalKm` e limpa a marca de "a
        // expedição mexeu na carga" é o POST /api/roteirizar (Organizar Rota), que
        // chama o OSRM de novo e aí sim tem a volta à base no total.
        const resumo = {
            ...rotaSalva.resumo,
            totalParadas: sequenciaRestante.length,
            totalSemGPS: semGPSRestante.length
        };

        // Salvar no banco
        await prisma.roteirizacao.update({
            where: { vendedorId: targetVendedorId },
            data: {
                sequencia: sequenciaRestante,
                semGPS: semGPSRestante,
                resumo
            }
        });

        return res.json({
            sequencia: sequenciaRestante,
            semGPS: semGPSRestante,
            resumo,
            recalcularNecessario: resumo?.recalcularNecessario === true
        });
    } catch (error) {
        console.error('[Roteirizacao recalcular-etas] Erro:', error);
        res.status(500).json({ error: 'Erro ao recalcular horários.' });
    }
});

module.exports = router;
