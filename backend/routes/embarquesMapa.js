// ==========================================================================
// MAPA DE DIVISÃO DE CARGAS (Expedição) — 08/2026
//
// A expedição decide QUEM leva o quê; o motorista continua decidindo a ORDEM
// (nada aqui toca em prioridadeEntrega / Roteirizacao / RotaLeads).
//
// Rotas (montadas sob /api/embarques, ANTES do router clássico de embarques —
// senão GET /mapa cairia no GET /:id):
//   GET  /mapa?data=YYYY-MM-DD   → cargas do dia + entregas posicionadas (leitura pura)
//   POST /sugerir-divisao        → proposta de divisão via OSRM (NÃO grava nada)
//   POST /estimar-rotas          → km/duração/volta de um arranjo manual (NÃO grava nada)
//   POST /aplicar-divisao        → grava o arranjo (única rota que escreve)
//
// Posição de cada entrega: Cliente.Ponto_GPS ("lat,lng"); sem ponto, o endereço
// escrito é geocodificado (mesmo provedor do módulo de GPS — Nominatim/BrasilAPI,
// com cache e fila de 1 req/s) e a posição entra como APROXIMADA (origemGps:
// "endereco"). Nada disso grava no cadastro do cliente.
//
// OSRM fora do ar NUNCA vira erro 500: os números saem por linha reta ×1,3 a
// 40 km/h, marcados como precisao "aproximada".
// ==========================================================================
const express = require('express');
const router = express.Router();
const prisma = require('../config/database'); // singleton compartilhado (pool único)
const verificarAuth = require('../middlewares/authMiddleware');
const {
    checkAcessoEmbarque,
    idsPedidosNoDelivery,
    wherePedidosLivresParaEmbarque,
    bloqueadosParaEmbarque,
    registrarVersaoEmbarque
} = require('./embarques');

// Elegibilidade de um pedido que JÁ está numa carga (mesma régua do helper de
// livres, sem as condições de "estar livre"): faturado ou especial/bonificação
// aprovados, nunca cancelado/devolvido/excluído. Usada para o mapa mostrar as
// paradas reais das cargas — um ZZ#/BN# embarcado é entrega de verdade, e um
// cancelado dentro de carga NÃO é.
const whereElegivelNaCarga = () => {
    const { embarqueId, ...resto } = wherePedidosLivresParaEmbarque();
    return resto;
};
const osrm = require('../services/osrmService');
const { particionarParadas } = require('../services/divisaoCargasService');
const { geocodeEndereco } = require('../services/gpsClientesService');

// Constantes da estimativa degradada (linha reta) — configuráveis por env.
const FATOR_ROTA_APROX = parseFloat(process.env.DIVISAO_FATOR_ROTA) || 1.3;
const VELOCIDADE_MEDIA_KMH = parseFloat(process.env.DIVISAO_VEL_MEDIA_KMH) || 40;
const LOCK_TTL_DIVISAO_MS = 60 * 1000; // sugestão faz 1 Table + K Trips — TTL maior que o do motorista
const GEOCODE_BUDGET_MS = 15000; // teto de tempo geocodificando por requisição (1 req/s no Nominatim)

const kmAprox = (a, b) => osrm.haversineKm(a, b) * FATOR_ROTA_APROX;
const duracaoAproxSeg = (a, b) => (kmAprox(a, b) / VELOCIDADE_MEDIA_KMH) * 3600;

// ── Montagem das entregas ─────────────────────────────────────────────────────
const etiquetaPedido = (p) => `${p.bonificacao ? 'BN#' : p.especial ? 'ZZ#' : '#'}${p.numero || p.id.slice(0, 8)}`;

const SELECT_PEDIDO_MAPA = {
    id: true, numero: true, especial: true, bonificacao: true,
    clienteId: true, embarqueId: true, statusEntrega: true, dataVenda: true,
    cliente: {
        select: {
            UUID: true, NomeFantasia: true, Nome: true, Ponto_GPS: true,
            End_Logradouro: true, End_Numero: true, End_Bairro: true,
            End_Cidade: true, End_Estado: true, End_CEP: true
        }
    },
    // Só para o Σ valor×quantidade — os itens NÃO vão no payload da resposta.
    itens: { select: { valor: true, quantidade: true } }
};

// Total do pedido: Σ item.valor × quantidade (Pedido não tem campo de total —
// mesmo cálculo do DetalhesCargaModal do frontend).
const totalPedido = (itens) =>
    (itens || []).reduce((acc, i) => acc + (Number(i.valor || 0) * Number(i.quantidade || 0)), 0);

const montarEntrega = (p) => {
    const gps = osrm.parsePontoGPS(p.cliente?.Ponto_GPS);
    return {
        pedidoId: p.id,
        numero: p.numero,
        etiqueta: etiquetaPedido(p),
        clienteId: p.clienteId,
        clienteNome: p.cliente?.NomeFantasia || p.cliente?.Nome || null,
        cidade: p.cliente?.End_Cidade || null,
        endereco: [p.cliente?.End_Logradouro, p.cliente?.End_Numero, p.cliente?.End_Cidade]
            .filter(Boolean).join(', '),
        valorTotal: Number(totalPedido(p.itens).toFixed(2)),
        dataVenda: p.dataVenda,
        gps,                               // { lat, lng } | null
        origemGps: gps ? 'gps' : null,     // 'gps' = Ponto_GPS | 'endereco' = geocodificado
        embarqueId: p.embarqueId || null,
        statusEntrega: p.statusEntrega,
        travado: p.statusEntrega !== 'PENDENTE'
    };
};

// Completa a posição das entregas sem Ponto_GPS geocodificando o endereço do
// cadastro (em série — o provedor público aceita ~1 req/s; cache de 24h no
// gpsClientesService). NUNCA estoura erro: quem falhar fica sem gps, com motivo.
async function completarComGeocode(entregas, clientePorPedido, budgetMs = GEOCODE_BUDGET_MS) {
    const inicio = Date.now();
    let pendentes = 0;
    for (const e of entregas) {
        if (e.gps) continue;
        const c = clientePorPedido.get(e.pedidoId);
        if (!c || (!c.End_Logradouro && !c.End_CEP)) {
            e.motivo = 'sem ponto GPS e sem endereço utilizável no cadastro';
            continue;
        }
        if (Date.now() - inicio > budgetMs) {
            e.motivo = 'geocodificação pendente — tente novamente em instantes';
            pendentes++;
            continue;
        }
        try {
            const { geo } = await geocodeEndereco({
                logradouro: c.End_Logradouro, numero: c.End_Numero, bairro: c.End_Bairro,
                cidade: c.End_Cidade, uf: c.End_Estado, cep: c.End_CEP
            });
            if (geo) {
                e.gps = geo;
                e.origemGps = 'endereco';
            } else {
                e.motivo = 'endereço não localizado no mapa';
            }
        } catch (err) {
            console.error('[EmbarquesMapa] Geocode falhou (segue sem posição):', err.message);
            e.motivo = 'falha na geocodificação do endereço';
        }
    }
    return { pendentes };
}

// Busca livres + pedidos das cargas informadas, monta as entregas e resolve as
// posições (Ponto_GPS → geocode do endereço). Compartilhado por /mapa e /sugerir-divisao.
async function carregarEntregas(embarqueIds, periodoEntrega = null) {
    const idsNoDelivery = await idsPedidosNoDelivery();
    // Livres: mesma régua do fluxo clássico (faturado, ou especial/bonificação
    // APROVADOS — pendente de aprovação não embarca nem aparece aqui).
    const whereLivres = wherePedidosLivresParaEmbarque(idsNoDelivery);
    if (periodoEntrega?.de && periodoEntrega?.ate) {
        whereLivres.dataVenda = {
            gte: new Date(`${periodoEntrega.de}T00:00:00-03:00`),
            lte: new Date(`${periodoEntrega.ate}T23:59:59.999-03:00`)
        };
    }
    const livres = await prisma.pedido.findMany({
        where: whereLivres,
        orderBy: { dataVenda: 'asc' },
        select: SELECT_PEDIDO_MAPA
    });
    // Nas cargas: também inclui especial/bonificação aprovados (são paradas reais
    // do motorista) e exclui cancelado/devolvido/excluído (não são entrega).
    const emCargas = embarqueIds.length ? await prisma.pedido.findMany({
        where: {
            ...whereElegivelNaCarga(),
            embarqueId: { in: embarqueIds }
        },
        orderBy: { dataVenda: 'asc' },
        select: SELECT_PEDIDO_MAPA
    }) : [];

    const pedidos = [...livres, ...emCargas];
    const clientePorPedido = new Map(pedidos.map(p => [p.id, p.cliente]));
    const todas = pedidos.map(montarEntrega);
    const { pendentes } = await completarComGeocode(todas, clientePorPedido);

    return {
        entregas: todas.filter(e => e.gps),
        semGps: todas.filter(e => !e.gps),
        geocodificadas: todas.filter(e => e.origemGps === 'endereco').length,
        geocodePendentes: pendentes
    };
}

// Intervalo do dia no fuso da empresa (dataSaida é gravada como T12:00-03:00)
const intervaloDia = (data) => ({
    gte: new Date(`${data}T00:00:00-03:00`),
    lte: new Date(`${data}T23:59:59.999-03:00`)
});

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^\d{1,2}:\d{2}$/;

// previsaoRetorno = horaSaida + duração da rota + tempoParada × nº de paradas
function calcularRetorno(horaSaida, duracaoMin, tempoParadaMin, nParadas) {
    if (!horaSaida || !HORA_RE.test(String(horaSaida))) return null;
    const [h, m] = String(horaSaida).split(':').map(Number);
    const total = Math.round(h * 60 + m + duracaoMin + (Number(tempoParadaMin) || 0) * nParadas);
    const hh = Math.floor(total / 60) % 24;
    const mm = total % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// Matriz de durações entre base + paradas (Table API; fallback linha reta ×1,3 a 40 km/h)
async function montarMatriz(pontos, avisos) {
    const aproximada = () => pontos.map(a => pontos.map(b => (a === b ? 0 : duracaoAproxSeg(a, b))));
    if (pontos.length <= 1) return { matriz: [[0]], precisao: 'osrm' };
    try {
        const data = await osrm.table(osrm.coordsParaString(pontos));
        if (data?.code === 'Ok' && Array.isArray(data.durations)) {
            // OSRM pode devolver null em pares não roteáveis — completa com a estimativa
            const matriz = data.durations.map((linha, i) =>
                linha.map((d, j) => (d == null ? duracaoAproxSeg(pontos[i], pontos[j]) : d)));
            return { matriz, precisao: 'osrm' };
        }
        throw new Error(`OSRM Table devolveu code=${data?.code || 'sem resposta'}`);
    } catch (err) {
        console.error('[EmbarquesMapa] Table API falhou — usando matriz aproximada:', err.message);
        avisos.push('Roteirizador (OSRM) indisponível — tempos e distâncias são aproximações por linha reta (±30%).');
        return { matriz: aproximada(), precisao: 'aproximada' };
    }
}

// km/duração reais de um grupo: Trip API base → paradas → base.
// Se o OSRM falhar (ou a matriz já for aproximada), estima pelo laço em linha reta.
async function medirGrupo(gpsParadas, precisaoMatriz, avisos) {
    if (!gpsParadas.length) return { distanciaKm: 0, duracaoMin: 0, precisao: precisaoMatriz, trajeto: [] };

    if (precisaoMatriz === 'osrm') {
        try {
            const data = await osrm.trip(
                osrm.coordsParaString([osrm.BASE_EMPRESA, ...gpsParadas]),
                'roundtrip=true&source=first&geometries=geojson&overview=full'
            );
            if (data?.code === 'Ok' && data.trips?.length) {
                return {
                    distanciaKm: +(data.trips[0].distance / 1000).toFixed(1),
                    duracaoMin: Math.round(data.trips[0].duration / 60),
                    precisao: 'osrm',
                    trajeto: (data.trips[0].geometry?.coordinates || []).map(([lng, lat]) => ({ lat, lng }))
                };
            }
            throw new Error(`OSRM Trip devolveu code=${data?.code || 'sem resposta'}`);
        } catch (err) {
            console.error('[EmbarquesMapa] Trip API falhou p/ grupo — estimando por linha reta:', err.message);
            const aviso = 'Parte dos números saiu por aproximação (OSRM não respondeu para todos os grupos).';
            if (!avisos.includes(aviso)) avisos.push(aviso);
        }
    }

    // Estimativa: laço base → paradas (na ordem recebida) → base
    const rota = [osrm.BASE_EMPRESA, ...gpsParadas, osrm.BASE_EMPRESA];
    let km = 0;
    for (let i = 0; i < rota.length - 1; i++) km += kmAprox(rota[i], rota[i + 1]);
    return {
        distanciaKm: +km.toFixed(1),
        duracaoMin: Math.round((km / VELOCIDADE_MEDIA_KMH) * 60),
        precisao: 'aproximada',
        trajeto: rota
    };
}

// ==========================================
// GET /mapa?data=YYYY-MM-DD — leitura pura (sem OSRM)
// ==========================================
router.get('/mapa', verificarAuth, checkAcessoEmbarque, async (req, res) => {
    try {
        const { data, entregaDe: entregaDeRecebida, entregaAte: entregaAteRecebida } = req.query;
        if (!data || !DATA_RE.test(data)) {
            return res.status(400).json({ error: 'Informe a data no formato YYYY-MM-DD.' });
        }
        // Compatibilidade com a tela anterior ainda em cache: sem período
        // explícito, ela continua vendo os pedidos do próprio dia do embarque.
        const entregaDe = entregaDeRecebida || data;
        const entregaAte = entregaAteRecebida || data;
        if (!DATA_RE.test(entregaDe) || !DATA_RE.test(entregaAte) || entregaDe > entregaAte) {
            return res.status(400).json({ error: 'Informe um período de entrega válido (entregaDe e entregaAte em YYYY-MM-DD).' });
        }

        const cargasDb = await prisma.embarque.findMany({
            where: { dataSaida: intervaloDia(data) },
            orderBy: { numero: 'asc' },
            include: {
                responsavel: { select: { id: true, nome: true } },
                _count: {
                    select: {
                        // Mesma régua das entregas do mapa: faturado ou especial/
                        // bonificação aprovados; cancelado/devolvido/excluído não conta.
                        pedidos: { where: whereElegivelNaCarga() }
                    }
                }
            }
        });

        const { entregas, semGps } = await carregarEntregas(cargasDb.map(c => c.id), { de: entregaDe, ate: entregaAte });

        res.json({
            cargas: cargasDb.map(c => ({
                id: c.id,
                numero: c.numero,
                dataSaida: c.dataSaida,
                versao: c.versao,
                ultimaImpressaoVersao: c.ultimaImpressaoVersao,
                responsavel: c.responsavel ? { id: c.responsavel.id, nome: c.responsavel.nome } : null,
                qtdPedidos: c._count.pedidos
            })),
            entregas,
            semGps,
            filtros: { dataEmbarque: data, entregaDe, entregaAte },
            base: osrm.BASE_EMPRESA
        });
    } catch (error) {
        console.error('[EmbarquesMapa] Erro no GET /mapa:', error);
        res.status(500).json({ error: 'Erro ao montar o mapa de entregas.' });
    }
});

// ==========================================
// POST /sugerir-divisao — proposta automática (NÃO grava nada)
// body: { data, embarqueIds: [..], horaSaida: "HH:MM", tempoParadaMin: 10 }
// ==========================================
router.post('/sugerir-divisao', verificarAuth, checkAcessoEmbarque, async (req, res) => {
    try {
        let { data, entregaDe, entregaAte, embarqueIds, horaSaida, tempoParadaMin = 10 } = req.body || {};
        if (!Array.isArray(embarqueIds) || embarqueIds.length === 0) {
            return res.status(400).json({ error: 'Informe embarqueIds (as cargas que vão dividir as entregas).' });
        }
        if (new Set(embarqueIds).size !== embarqueIds.length) {
            return res.status(400).json({ error: 'Há carga repetida em embarqueIds.' });
        }

        const cargas = await prisma.embarque.findMany({
            where: { id: { in: embarqueIds } },
            include: { responsavel: { select: { id: true, nome: true } } }
        });
        if (cargas.length !== embarqueIds.length) {
            return res.status(400).json({ error: 'Uma ou mais cargas informadas não existem.' });
        }
        // A versão inicial da tela enviava somente embarqueIds. Derivamos a
        // data das próprias cargas até o navegador carregar o JS novo.
        if (!data) data = cargas[0].dataSaida.toISOString().slice(0, 10);
        if (!DATA_RE.test(data)) {
            return res.status(400).json({ error: 'Informe a data do embarque no formato YYYY-MM-DD.' });
        }
        entregaDe = entregaDe || data;
        entregaAte = entregaAte || data;
        if (!DATA_RE.test(entregaDe) || !DATA_RE.test(entregaAte) || entregaDe > entregaAte) {
            return res.status(400).json({ error: 'Informe um período de entrega válido (entregaDe e entregaAte em YYYY-MM-DD).' });
        }
        const idsForaDoDia = cargas.filter(c => c.dataSaida < intervaloDia(data).gte || c.dataSaida > intervaloDia(data).lte).map(c => c.id);
        if (idsForaDoDia.length) {
            return res.status(400).json({ error: 'Uma ou mais cargas não pertencem à data de embarque selecionada.' });
        }
        const cargaPorId = new Map(cargas.map(c => [c.id, c]));

        // Lock compartilhado com o "Organizar Rota" do motorista (um uso do OSRM por vez)
        const lockToken = osrm.adquirirLock(`expedicao:${req.user.id}`, LOCK_TTL_DIVISAO_MS);
        if (!lockToken) {
            const lock = osrm.getLock();
            return res.status(423).json({
                error: 'Já existe um cálculo de rota em andamento (motorista ou expedição). Aguarde alguns segundos.',
                ocupadoPor: lock?.ownerId || null,
                iniciadoEm: lock ? new Date(lock.iniciadoEm).toISOString() : null
            });
        }

        try {
            const avisos = [];
            const { entregas, semGps, geocodificadas, geocodePendentes } = await carregarEntregas(embarqueIds, { de: entregaDe, ate: entregaAte });

            if (geocodificadas > 0) {
                avisos.push(`${geocodificadas} entrega(s) posicionada(s) pelo endereço escrito do cadastro (posição aproximada, cliente sem ponto GPS).`);
            }
            if (geocodePendentes > 0) {
                avisos.push(`${geocodePendentes} endereço(s) ainda não geocodificado(s) — tente de novo em instantes para incluí-los.`);
            }

            // paradas = entregas com posição; índice na matriz = posição no array + 1 (0 = base)
            const paradas = entregas;
            const idxGrupo = new Map(embarqueIds.map((id, i) => [id, i]));

            // Entregas travadas (já roteirizadas/concluídas) ficam presas à própria carga
            const fixos = [];
            paradas.forEach((e, i) => {
                if (e.travado && e.embarqueId && idxGrupo.has(e.embarqueId)) {
                    fixos.push({ parada: i + 1, grupo: idxGrupo.get(e.embarqueId) });
                }
            });
            const travadosSemGps = semGps.filter(e => e.travado && e.embarqueId && idxGrupo.has(e.embarqueId));
            if (travadosSemGps.length) {
                avisos.push(`${travadosSemGps.length} entrega(s) sem posição no mapa já roteirizada(s)/concluída(s) permanecem na própria carga, fora do cálculo de rota.`);
            }
            if (semGps.length - travadosSemGps.length > 0) {
                avisos.push(`${semGps.length - travadosSemGps.length} entrega(s) sem posição ficaram fora da divisão — veja a lista semGps.`);
            }

            const pontos = [osrm.BASE_EMPRESA, ...paradas.map(e => e.gps)];
            const { matriz, precisao } = await montarMatriz(pontos, avisos);

            const { grupos } = particionarParadas(matriz, embarqueIds.length, { fixos });

            const gruposResp = [];
            for (let g = 0; g < embarqueIds.length; g++) {
                const stops = grupos[g].map(i => paradas[i - 1]);
                const med = await medirGrupo(stops.map(s => s.gps), precisao, avisos);
                const pedidoIds = stops.map(s => s.pedidoId);
                // Travado sem posição continua pertencendo ao grupo da própria carga
                for (const e of travadosSemGps) {
                    if (e.embarqueId === embarqueIds[g]) pedidoIds.push(e.pedidoId);
                }
                const carga = cargaPorId.get(embarqueIds[g]);
                gruposResp.push({
                    embarqueId: embarqueIds[g],
                    motorista: carga?.responsavel?.nome || null,
                    pedidoIds,
                    distanciaKm: med.distanciaKm,
                    duracaoMin: med.duracaoMin,
                    previsaoRetorno: calcularRetorno(horaSaida, med.duracaoMin, tempoParadaMin, stops.length),
                    precisao: med.precisao,
                    trajeto: med.trajeto
                });
            }

            res.json({
                grupos: gruposResp,
                semGps,
                avisos,
                criterio: {
                    principal: 'Equilibrar o tempo total das rotas entre as cargas',
                    considera: ['tempo rodoviário entre os pontos', 'saída e retorno à Hardt', 'tempo informado por parada'],
                    preserva: 'Pedidos já roteirizados ou em entrega permanecem na carga atual',
                    naoConsidera: ['territórios fixos por cidade', 'capacidade ou peso do veículo', 'valor do pedido']
                }
            });
        } finally {
            osrm.liberarLock(lockToken);
        }
    } catch (error) {
        console.error('[EmbarquesMapa] Erro no sugerir-divisao:', error);
        res.status(500).json({ error: 'Erro ao calcular a sugestão de divisão.' });
    }
});

// ==========================================
// POST /estimar-rotas — números de um arranjo montado na mão (NÃO grava nada)
// body: { grupos: [{ embarqueId, pedidoIds }], horaSaida, tempoParadaMin }
// ==========================================
router.post('/estimar-rotas', verificarAuth, checkAcessoEmbarque, async (req, res) => {
    try {
        const { grupos, horaSaida, tempoParadaMin = 10 } = req.body || {};
        if (!Array.isArray(grupos) || grupos.length === 0) {
            return res.status(400).json({ error: 'Informe grupos: [{ embarqueId, pedidoIds }].' });
        }

        const todosIds = [...new Set(grupos.flatMap(g => Array.isArray(g?.pedidoIds) ? g.pedidoIds : []))];
        const pedidos = todosIds.length ? await prisma.pedido.findMany({
            where: { id: { in: todosIds } },
            select: SELECT_PEDIDO_MAPA
        }) : [];
        const entregaPorId = new Map(pedidos.map(p => [p.id, montarEntrega(p)]));
        const clientePorPedido = new Map(pedidos.map(p => [p.id, p.cliente]));

        const embarqueIdsValidos = [...new Set(grupos.map(g => g?.embarqueId).filter(Boolean))];
        const cargas = embarqueIdsValidos.length ? await prisma.embarque.findMany({
            where: { id: { in: embarqueIdsValidos } },
            include: { responsavel: { select: { nome: true } } }
        }) : [];
        const cargaPorId = new Map(cargas.map(c => [c.id, c]));

        const lockToken = osrm.adquirirLock(`expedicao:${req.user.id}`, LOCK_TTL_DIVISAO_MS);
        if (!lockToken) {
            const lock = osrm.getLock();
            return res.status(423).json({
                error: 'Já existe um cálculo de rota em andamento (motorista ou expedição). Aguarde alguns segundos.',
                ocupadoPor: lock?.ownerId || null,
                iniciadoEm: lock ? new Date(lock.iniciadoEm).toISOString() : null
            });
        }

        try {
            const avisos = [];
            // Posiciona quem não tem Ponto_GPS pelo endereço (mesma régua do /mapa)
            await completarComGeocode([...entregaPorId.values()], clientePorPedido);
            const geocodificadas = [...entregaPorId.values()].filter(e => e.origemGps === 'endereco').length;
            if (geocodificadas > 0) {
                avisos.push(`${geocodificadas} entrega(s) posicionada(s) pelo endereço escrito do cadastro (posição aproximada, cliente sem ponto GPS).`);
            }

            const semGps = [];
            const gruposResp = [];
            for (const g of grupos) {
                const pedidoIds = Array.isArray(g?.pedidoIds) ? g.pedidoIds : [];
                const stops = [];
                for (const pid of pedidoIds) {
                    const e = entregaPorId.get(pid);
                    if (!e) {
                        semGps.push({ pedidoId: pid, motivo: 'pedido não encontrado' });
                    } else if (e.gps) {
                        stops.push(e);
                    } else {
                        semGps.push(e);
                    }
                }
                const med = await medirGrupo(stops.map(s => s.gps), 'osrm', avisos);
                gruposResp.push({
                    embarqueId: g.embarqueId || null,
                    motorista: cargaPorId.get(g.embarqueId)?.responsavel?.nome || null,
                    pedidoIds,
                    distanciaKm: med.distanciaKm,
                    duracaoMin: med.duracaoMin,
                    previsaoRetorno: calcularRetorno(horaSaida, med.duracaoMin, tempoParadaMin, stops.length),
                    precisao: med.precisao,
                    trajeto: med.trajeto
                });
            }

            res.json({ grupos: gruposResp, semGps, avisos });
        } finally {
            osrm.liberarLock(lockToken);
        }
    } catch (error) {
        console.error('[EmbarquesMapa] Erro no estimar-rotas:', error);
        res.status(500).json({ error: 'Erro ao estimar as rotas.' });
    }
});

// ==========================================
// POST /aplicar-divisao — grava o arranjo (única rota de escrita)
// body: { atribuicoes: [{ pedidoId, embarqueId|null }], esperado: [{ pedidoId, embarqueIdAtual }] }
// 409 = o estado do banco divergiu do que a tela viu (NADA é aplicado).
// ==========================================
router.post('/aplicar-divisao', verificarAuth, checkAcessoEmbarque, async (req, res) => {
    try {
        const { atribuicoes, esperado } = req.body || {};
        if (!Array.isArray(atribuicoes) || atribuicoes.length === 0) {
            return res.status(400).json({ error: 'Informe atribuicoes: [{ pedidoId, embarqueId|null }].' });
        }
        if (!Array.isArray(esperado)) {
            return res.status(400).json({ error: 'Informe esperado: [{ pedidoId, embarqueIdAtual }] (trava contra edição simultânea).' });
        }

        const pedidoIds = atribuicoes.map(a => a?.pedidoId).filter(Boolean);
        if (pedidoIds.length !== atribuicoes.length) {
            return res.status(400).json({ error: 'Toda atribuição precisa de pedidoId.' });
        }
        if (new Set(pedidoIds).size !== pedidoIds.length) {
            return res.status(400).json({ error: 'Há pedido repetido em atribuicoes.' });
        }

        const esperadoPorPedido = new Map(esperado.map(e => [e?.pedidoId, e?.embarqueIdAtual || null]));
        const semEsperado = pedidoIds.filter(id => !esperadoPorPedido.has(id));
        if (semEsperado.length) {
            return res.status(400).json({
                error: 'Todo pedido em atribuicoes precisa constar em esperado (com a carga em que a tela o viu).',
                pedidosSemEsperado: semEsperado
            });
        }

        const pedidos = await prisma.pedido.findMany({
            where: { id: { in: pedidoIds } },
            select: {
                id: true, numero: true, embarqueId: true, situacaoCA: true, statusEnvio: true,
                especial: true, bonificacao: true, cancelado: true, devolucaoFinalizada: true,
                statusEntrega: true,
                cliente: { select: { NomeFantasia: true, Nome: true } }
            }
        });
        const porId = new Map(pedidos.map(p => [p.id, p]));
        const nomeCliente = (p) => p?.cliente?.NomeFantasia || p?.cliente?.Nome || null;

        // 1) Trava otimista: banco divergiu da tela → 409 com a lista, NADA aplicado
        const conflitos = [];
        for (const id of pedidoIds) {
            const p = porId.get(id);
            if (!p) {
                conflitos.push({ pedidoId: id, embarqueIdAtual: null, motivo: 'pedido não existe mais' });
                continue;
            }
            const atual = p.embarqueId || null;
            if (atual !== esperadoPorPedido.get(id)) {
                conflitos.push({ pedidoId: id, embarqueIdAtual: atual, motivo: 'a carga do pedido mudou desde que a tela foi carregada' });
            }
        }
        if (conflitos.length) {
            return res.status(409).json({
                error: 'O arranjo mudou desde que a tela foi carregada. Recarregue o mapa e tente de novo — nada foi aplicado.',
                conflitos
            });
        }

        // 2) Cargas de destino precisam existir
        const destinos = [...new Set(atribuicoes.map(a => a.embarqueId).filter(Boolean))];
        if (destinos.length) {
            const existentes = await prisma.embarque.findMany({ where: { id: { in: destinos } }, select: { id: true } });
            if (existentes.length !== destinos.length) {
                const achou = new Set(existentes.map(e => e.id));
                return res.status(400).json({
                    error: 'Uma ou mais cargas de destino não existem.',
                    cargasInexistentes: destinos.filter(d => !achou.has(d))
                });
            }
        }

        // 3) Só interessa o que muda de verdade
        const mudancas = atribuicoes
            .map(a => ({ pedidoId: a.pedidoId, embarqueId: a.embarqueId || null, atual: porId.get(a.pedidoId).embarqueId || null }))
            .filter(a => a.embarqueId !== a.atual)
            .sort((a, b) => a.pedidoId.localeCompare(b.pedidoId));
        if (!mudancas.length) {
            return res.json({ message: 'Nada a alterar — o arranjo já está aplicado.', aplicadas: 0, cargasAfetadas: [] });
        }

        // 4) Entrega já roteirizada/concluída NUNCA muda de carga (mesma regra do
        //    DELETE /:id/pedidos/:pedidoId) + revalidação de aptidão para quem entra
        //    em carga (bloqueadosParaEmbarque, sem contar as cargas do próprio arranjo).
        const bloqueados = [];
        for (const m of mudancas) {
            const p = porId.get(m.pedidoId);
            if (p.statusEntrega !== 'PENDENTE') {
                bloqueados.push({ pedido: etiquetaPedido(p), cliente: nomeCliente(p), motivo: `entrega já ${p.statusEntrega} — não sai mais da carga` });
            }
        }
        const cargasArranjo = new Set([...destinos, ...pedidos.map(p => p.embarqueId).filter(Boolean)]);
        const entrandoEmCarga = mudancas.filter(m => m.embarqueId).map(m => m.pedidoId);
        if (entrandoEmCarga.length) {
            bloqueados.push(...await bloqueadosParaEmbarque(entrandoEmCarga, { cargasPermitidas: cargasArranjo }));
        }
        if (bloqueados.length) {
            return res.status(400).json({
                error: `Não dá para aplicar: ${bloqueados.map(b => `${b.pedido} (${b.motivo})`).join(', ')}.`,
                bloqueados
            });
        }

        // 5) Prepara o histórico. Na transação ficam SÓ a revalidação e a escrita
        //    dos pedidos (o que é atômico de verdade); versão/log das cargas e a
        //    limpeza do cache de rota rodam DEPOIS, best-effort — falha neles
        //    nunca desfaz o remanejo. Não há rede dentro da transação.
        const cargasAfetadas = [...new Set(mudancas.flatMap(m => [m.atual, m.embarqueId].filter(Boolean)))];
        const alteracoesPorCarga = new Map();
        for (const m of mudancas) {
            const etiq = etiquetaPedido(porId.get(m.pedidoId));
            if (m.atual) {
                if (!alteracoesPorCarga.has(m.atual)) alteracoesPorCarga.set(m.atual, { sairam: [], entraram: [] });
                alteracoesPorCarga.get(m.atual).sairam.push(etiq);
            }
            if (m.embarqueId) {
                if (!alteracoesPorCarga.has(m.embarqueId)) alteracoesPorCarga.set(m.embarqueId, { sairam: [], entraram: [] });
                alteracoesPorCarga.get(m.embarqueId).entraram.push(etiq);
            }
        }

        await prisma.$transaction(async (tx) => {
            // Revalida tudo no instante da escrita. updateMany com embarqueId esperado
            // é a trava real: sob corrida, somente uma transação altera cada pedido.
            const atuais = await tx.pedido.findMany({
                where: { id: { in: pedidoIds } },
                select: {
                    id: true, numero: true, embarqueId: true, situacaoCA: true, statusEnvio: true,
                    especial: true, bonificacao: true, cancelado: true, devolucaoFinalizada: true,
                    statusEntrega: true,
                    cliente: { select: { NomeFantasia: true, Nome: true } }
                }
            });
            const atualPorId = new Map(atuais.map(p => [p.id, p]));

            const delivery = await tx.deliveryStatus.findMany({
                where: { pedidoId: { in: pedidoIds } }, select: { pedidoId: true }
            });
            const deliveryIds = new Set(delivery.map(d => d.pedidoId));

            const impedimentos = [];
            for (const m of mudancas) {
                const p = atualPorId.get(m.pedidoId);
                const esperadoAtual = esperadoPorPedido.get(m.pedidoId);
                if (!p || (p.embarqueId || null) !== esperadoAtual) {
                    const err = new Error('CONFLITO_DIVISAO');
                    err.statusCode = 409;
                    throw err;
                }
                const etiqueta = etiquetaPedido(p);
                const impedir = (motivo) => impedimentos.push({ pedido: etiqueta, cliente: nomeCliente(p), motivo });
                if (p.statusEntrega !== 'PENDENTE') { impedir(`entrega já ${p.statusEntrega}`); continue; }
                // Tirar da carga (destino null): mesma régua do DELETE clássico
                // (/:id/pedidos/:pedidoId) — só o statusEntrega importa. Cancelado/
                // devolvido/excluído PODE (e deve poder) sair da carga.
                if (!m.embarqueId) continue;
                // Entrar em carga: pedido do Delivery não entra, e vale a mesma
                // elegibilidade da listagem (faturado ou especial/bonificação aprovados).
                if (deliveryIds.has(p.id)) impedir('pedido pertence ao fluxo de Delivery');
                else if (p.cancelado) impedir('pedido cancelado');
                else if (p.devolucaoFinalizada) impedir('pedido já devolvido');
                else if (p.statusEnvio === 'EXCLUIDO') impedir('pedido excluído');
                else if (p.especial && p.statusEnvio === 'ENVIAR') impedir('especial pendente de aprovação');
                else if (p.bonificacao && p.statusEnvio === 'ENVIAR') impedir('bonificação pendente de aprovação');
                else if (!(p.situacaoCA === 'FATURADO' ||
                    (p.especial && p.statusEnvio === 'RECEBIDO') || (p.bonificacao && p.statusEnvio === 'RECEBIDO'))) {
                    impedir('não está faturado nem aprovado para envio');
                }
            }
            if (impedimentos.length) {
                const err = new Error('PEDIDOS_BLOQUEADOS');
                err.statusCode = 400;
                err.bloqueados = impedimentos;
                throw err;
            }

            if (destinos.length) {
                const qtdDestinos = await tx.embarque.count({ where: { id: { in: destinos } } });
                if (qtdDestinos !== destinos.length) {
                    const err = new Error('CARGA_INEXISTENTE');
                    err.statusCode = 400;
                    throw err;
                }
            }

            for (const m of mudancas) {
                const alterado = await tx.pedido.updateMany({
                    where: { id: m.pedidoId, embarqueId: esperadoPorPedido.get(m.pedidoId) },
                    data: m.embarqueId ? { embarqueId: m.embarqueId, statusEntrega: 'PENDENTE' } : { embarqueId: null }
                });
                if (alterado.count !== 1) {
                    const err = new Error('CONFLITO_DIVISAO');
                    err.statusCode = 409;
                    throw err;
                }
            }
        }, { timeout: 20000, maxWait: 10000 });

        // Versão + histórico das cargas afetadas (best-effort, fora da transação —
        // o helper já engole a própria falha sem afetar o remanejo aplicado).
        for (const [cargaId, alteracoes] of alteracoesPorCarga) {
            await registrarVersaoEmbarque(cargaId, 'DIVISAO_APLICADA', alteracoes, req.user.id);
        }

        // Limpeza do cache de rota dos motoristas (best-effort): pedido remanejado
        // sai das roteirizações salvas (Roteirizacao.sequencia/semGPS) para não
        // deixar parada fantasma no painel de quem já tinha organizado a rota.
        // Espelha o recalcular-etas: renumera a sequência, atualiza os totais do
        // resumo e apaga a rota que ficou sem paradas.
        try {
            const movidos = new Set(mudancas.map(m => m.pedidoId));
            const rotas = await prisma.roteirizacao.findMany();
            for (const rota of rotas) {
                const seq = Array.isArray(rota.sequencia) ? rota.sequencia : [];
                const sem = Array.isArray(rota.semGPS) ? rota.semGPS : [];
                const temMovido = [...seq, ...sem].some(i => i?.pedidoId && movidos.has(i.pedidoId));
                if (!temMovido) continue;
                const novaSeq = seq
                    .filter(i => !(i?.pedidoId && movidos.has(i.pedidoId)))
                    .map((i, idx) => ({ ...i, sequencia: idx + 1 }));
                const novoSem = sem.filter(i => !(i?.pedidoId && movidos.has(i.pedidoId)));
                if (novaSeq.length === 0) {
                    // Mesma regra do recalcular-etas: rota sem paradas deixa de existir.
                    await prisma.roteirizacao.delete({ where: { id: rota.id } });
                } else {
                    await prisma.roteirizacao.update({
                        where: { id: rota.id },
                        data: {
                            sequencia: novaSeq,
                            semGPS: novoSem,
                            resumo: {
                                ...(rota.resumo && typeof rota.resumo === 'object' ? rota.resumo : {}),
                                totalParadas: novaSeq.length,
                                totalSemGPS: novoSem.length
                            }
                        }
                    });
                }
            }
        } catch (eRota) {
            console.error('[EmbarquesMapa] Falha ao limpar roteirizações salvas (cache — divisão JÁ aplicada):', eRota.message);
        }

        res.json({
            message: `${mudancas.length} pedido(s) remanejado(s).`,
            aplicadas: mudancas.length,
            cargasAfetadas
        });
    } catch (error) {
        if (error.statusCode === 409 || error.code === 'P2034') {
            return res.status(409).json({
                error: 'O arranjo mudou desde que a tela foi carregada. Recarregue o mapa e tente de novo — nada foi aplicado.'
            });
        }
        if (error.message === 'PEDIDOS_BLOQUEADOS') {
            return res.status(400).json({ error: 'Um ou mais pedidos não podem ser remanejados.', bloqueados: error.bloqueados });
        }
        if (error.message === 'CARGA_INEXISTENTE') {
            return res.status(400).json({ error: 'Uma ou mais cargas de destino não existem.' });
        }
        console.error('[EmbarquesMapa] Erro no aplicar-divisao:', error);
        res.status(500).json({ error: 'Erro ao aplicar a divisão.' });
    }
});

module.exports = router;
