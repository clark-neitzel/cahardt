// ==========================================================================
// MAPA DE DIVISÃO DE CARGAS (Expedição) — 08/2026
//
// A expedição decide QUEM leva o quê; o motorista continua decidindo a ORDEM
// (nada aqui toca em prioridadeEntrega / Roteirizacao / RotaLeads).
//
// Rotas (montadas sob /api/embarques, ANTES do router clássico de embarques —
// senão GET /mapa cairia no GET /:id):
//   GET  /mapa?data=YYYY-MM-DD   → cargas do dia + entregas/amostras/cobranças posicionadas
//   POST /sugerir-divisao        → proposta de divisão via OSRM (NÃO grava nada)
//   POST /estimar-rotas          → km/duração/volta de um arranjo manual (NÃO grava nada)
//   POST /aplicar-divisao        → grava o arranjo (única rota que escreve)
//
// Desde 08/2026 o mapa carrega TRÊS tipos de item (pedido, amostra, cobrança):
//   - pedido   → como sempre (inclui bonificação BN# e especial ZZ#, já aprovados);
//   - amostra  → AM#: LIBERADAS livres + as penduradas nas cargas do dia
//                (ENTREGUE = travada, não se move mais);
//   - cobranca → CB#: só as CobrancaRota penduradas nas cargas do dia (cobrança
//                avulsa continua nascendo pelo botão "Inserir Cobrança" — o mapa
//                não lista títulos em aberto soltos). Status != PENDENTE = travada.
// Regra central (pedido do dono): itens do MESMO CLIENTE andam SEMPRE juntos —
// a sugestão agrupa por cliente (1 parada por local) e o aplicar-divisao aceita
// os três tipos, para mover tudo do cliente de uma vez.
//
// Posição de cada item: Cliente.Ponto_GPS ("lat,lng") — amostra de lead usa
// lead.pontoGps; sem ponto, o endereço escrito é geocodificado (mesmo provedor
// do módulo de GPS — Nominatim/BrasilAPI, com cache e fila de 1 req/s) e a
// posição entra como APROXIMADA (origemGps: "endereco"). Nada grava no cadastro.
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
    registrarVersaoEmbarque,
    registrarLogEmbarque
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

// ── Tipos de item do mapa ─────────────────────────────────────────────────────
const TIPOS_VALIDOS = new Set(['pedido', 'amostra', 'cobranca']);
// Amostra que pode entrar/sair de carga: só LIBERADA (mesma régua do POST /:id/amostras).
const AMOSTRA_STATUS_MOVIVEL = 'LIBERADO';
// Statuses de amostra que aparecem dentro das cargas do dia (CANCELADA fica fora,
// como pedido cancelado; SOLICITADA/PREPARACAO nunca entram em carga).
const AMOSTRA_STATUS_NA_CARGA = ['LIBERADO', 'ENTREGUE'];
// Cobrança: UMA régua só (unificada em 08/2026) — toda CobrancaRota pendurada na
// carga conta e aparece, em qualquer status. Antes o mapa listava todas (a não
// PENDENTE aparecia travada) mas o contador do cartão pulava a NAO_COBRADA, e o
// operador via dois cadeados "$" com o cartão dizendo "1 cobrança".
// Por que contar tudo (e não esconder a NAO_COBRADA, como se faz com pedido
// cancelado e amostra CANCELADA): "não cobrada" NÃO é o fim da linha — o
// escritório desfaz o registro (POST /cobrancas-rota/:id/desfazer) e ela volta a
// PENDENTE na mesma carga. Além disso a seção "Cobranças na Carga" do Painel de
// Expedição (GET /cobrancas-rota/embarque/:id) também lista todas — assim as três
// telas mostram o mesmo número.

const etiquetaPedido = (p) => `${p.bonificacao ? 'BN#' : p.especial ? 'ZZ#' : '#'}${p.numero || p.id.slice(0, 8)}`;
const etiquetaAmostra = (a) => `AM#${a.numero || a.id.slice(0, 8)}`;
const etiquetaCobranca = (c) => {
    const numPedido = c.parcela?.contaReceber?.pedido?.numero;
    const numParcela = c.parcela?.numeroParcela;
    return numPedido ? `CB#${numPedido}${numParcela ? `/${numParcela}` : ''}` : `CB#${c.id.slice(0, 8)}`;
};

// Id "de negócio" de um item já montado (pedidoId | amostraId | cobrancaRotaId)
const idDoItem = (i) => i.pedidoId || i.amostraId || i.cobrancaRotaId;

// Campos do cliente usados para posicionar qualquer tipo de item
const SELECT_CLIENTE_GPS = {
    UUID: true, NomeFantasia: true, Nome: true, Ponto_GPS: true,
    End_Logradouro: true, End_Numero: true, End_Bairro: true,
    End_Cidade: true, End_Estado: true, End_CEP: true
};

const SELECT_PEDIDO_MAPA = {
    id: true, numero: true, especial: true, bonificacao: true,
    clienteId: true, embarqueId: true, statusEntrega: true, dataVenda: true,
    cliente: { select: SELECT_CLIENTE_GPS },
    // Só para o Σ valor×quantidade — os itens NÃO vão no payload da resposta.
    itens: { select: { valor: true, quantidade: true } }
};

const SELECT_AMOSTRA_MAPA = {
    id: true, numero: true, status: true, embarqueId: true,
    clienteId: true, leadId: true,
    cliente: { select: SELECT_CLIENTE_GPS },
    lead: { select: { nomeEstabelecimento: true, pontoGps: true, cidade: true } }
};

const SELECT_COBRANCA_MAPA = {
    id: true, status: true, embarqueId: true,
    parcela: {
        select: {
            numeroParcela: true, valor: true, valorPago: true, valorDescontoTotal: true,
            contaReceber: {
                select: {
                    clienteId: true,
                    cliente: { select: SELECT_CLIENTE_GPS },
                    pedido: { select: { numero: true } }
                }
            }
        }
    }
};

// Total do pedido: Σ item.valor × quantidade (Pedido não tem campo de total —
// mesmo cálculo do DetalhesCargaModal do frontend).
const totalPedido = (itens) =>
    (itens || []).reduce((acc, i) => acc + (Number(i.valor || 0) * Number(i.quantidade || 0)), 0);

// Saldo em aberto de uma parcela (mesma conta do routes/cobrancasRota.js)
const saldoParcela = (p) =>
    Math.round((Number(p.valor) - Number(p.valorPago || 0) - Number(p.valorDescontoTotal || 0)) * 100) / 100;

const enderecoDoCliente = (c) =>
    [c?.End_Logradouro, c?.End_Numero, c?.End_Cidade].filter(Boolean).join(', ') || null;

const montarEntrega = (p) => {
    const gps = osrm.parsePontoGPS(p.cliente?.Ponto_GPS);
    return {
        tipo: 'pedido',
        pedidoId: p.id,
        numero: p.numero,
        etiqueta: etiquetaPedido(p),
        bonificacao: !!p.bonificacao,
        especial: !!p.especial,
        clienteId: p.clienteId,
        clienteNome: p.cliente?.NomeFantasia || p.cliente?.Nome || null,
        cidade: p.cliente?.End_Cidade || null,
        endereco: enderecoDoCliente(p.cliente) || '',
        valorTotal: Number(totalPedido(p.itens).toFixed(2)),
        dataVenda: p.dataVenda,
        gps,                               // { lat, lng } | null
        origemGps: gps ? 'gps' : null,     // 'gps' = Ponto_GPS | 'endereco' = geocodificado
        embarqueId: p.embarqueId || null,
        statusEntrega: p.statusEntrega,
        travado: p.statusEntrega !== 'PENDENTE'
    };
};

const montarAmostra = (a) => {
    // Amostra de cliente usa o Ponto_GPS do cadastro; de lead, o pontoGps do lead.
    const gps = osrm.parsePontoGPS(a.cliente?.Ponto_GPS) || osrm.parsePontoGPS(a.lead?.pontoGps);
    return {
        tipo: 'amostra',
        amostraId: a.id,
        numero: a.numero,
        etiqueta: etiquetaAmostra(a),
        clienteId: a.clienteId || null,
        leadId: a.leadId || null,
        clienteNome: a.cliente?.NomeFantasia || a.cliente?.Nome || a.lead?.nomeEstabelecimento || null,
        cidade: a.cliente?.End_Cidade || a.lead?.cidade || null,
        endereco: enderecoDoCliente(a.cliente),
        gps,
        origemGps: gps ? 'gps' : null,
        embarqueId: a.embarqueId || null,
        statusAmostra: a.status,
        travado: a.status !== AMOSTRA_STATUS_MOVIVEL // ENTREGUE (ou outro) não se move mais
    };
};

const montarCobranca = (c) => {
    const conta = c.parcela?.contaReceber;
    const gps = osrm.parsePontoGPS(conta?.cliente?.Ponto_GPS);
    return {
        tipo: 'cobranca',
        cobrancaRotaId: c.id,
        etiqueta: etiquetaCobranca(c),
        clienteId: conta?.clienteId || null,
        clienteNome: conta?.cliente?.NomeFantasia || conta?.cliente?.Nome || null,
        cidade: conta?.cliente?.End_Cidade || null,
        endereco: enderecoDoCliente(conta?.cliente),
        valor: c.parcela ? saldoParcela(c.parcela) : null, // saldo em aberto do título
        gps,
        origemGps: gps ? 'gps' : null,
        embarqueId: c.embarqueId || null,
        statusCobranca: c.status,
        travado: c.status !== 'PENDENTE' // cobrada/baixada/não-cobrada não se move (régua do DELETE clássico)
    };
};

// Completa a posição dos itens sem GPS geocodificando o endereço do cadastro
// do CLIENTE (em série — o provedor público aceita ~1 req/s; cache de 24h no
// gpsClientesService). Amostra de lead não tem endereço estruturado → fica sem
// posição, com motivo. NUNCA estoura erro: quem falhar fica sem gps, com motivo.
// `clientePorItem` é um Map indexado pelo PRÓPRIO objeto do item (serve para os
// três tipos, sem depender do nome do campo de id).
async function completarComGeocode(itens, clientePorItem, budgetMs = GEOCODE_BUDGET_MS) {
    const inicio = Date.now();
    let pendentes = 0;
    for (const e of itens) {
        if (e.gps) continue;
        const c = clientePorItem.get(e);
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

// Busca pedidos livres + pedidos/amostras/cobranças das cargas informadas,
// monta os itens e resolve as posições (Ponto_GPS → geocode do endereço).
// Compartilhado por /mapa e /sugerir-divisao.
async function carregarItens(embarqueIds, periodoEntrega = null) {
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

    // Amostras: LIBERADAS livres (sem carga) + as das cargas do dia (LIBERADO/ENTREGUE)
    const amostrasDb = await prisma.amostra.findMany({
        where: {
            OR: [
                { status: AMOSTRA_STATUS_MOVIVEL, embarqueId: null },
                ...(embarqueIds.length
                    ? [{ embarqueId: { in: embarqueIds }, status: { in: AMOSTRA_STATUS_NA_CARGA } }]
                    : [])
            ]
        },
        orderBy: { createdAt: 'asc' },
        select: SELECT_AMOSTRA_MAPA
    });

    // Cobranças: SÓ as penduradas nas cargas do dia — TODAS elas, em qualquer
    // status (as que não estão PENDENTE aparecem travadas). É a mesma régua do
    // contador do cartão em GET /mapa e da seção "Cobranças na Carga" do painel.
    // Cobrança avulsa (sem carga) nasce direto COBRADA pela busca livre — não
    // existe "cobrança livre pendente" legítima para listar; título em aberto
    // entra pela busca do "Inserir Cobrança".
    const cobrancasDb = embarqueIds.length ? await prisma.cobrancaRota.findMany({
        where: { embarqueId: { in: embarqueIds } },
        orderBy: { createdAt: 'asc' },
        select: SELECT_COBRANCA_MAPA
    }) : [];

    const pedidos = [...livres, ...emCargas];
    const itensPedido = pedidos.map(montarEntrega);
    const itensAmostra = amostrasDb.map(montarAmostra);
    const itensCobranca = cobrancasDb.map(montarCobranca);

    const clientePorItem = new Map();
    pedidos.forEach((p, i) => clientePorItem.set(itensPedido[i], p.cliente));
    amostrasDb.forEach((a, i) => clientePorItem.set(itensAmostra[i], a.cliente)); // lead: sem endereço p/ geocode
    cobrancasDb.forEach((c, i) => clientePorItem.set(itensCobranca[i], c.parcela?.contaReceber?.cliente));

    const todos = [...itensPedido, ...itensAmostra, ...itensCobranca];
    const { pendentes } = await completarComGeocode(todos, clientePorItem);

    return {
        entregas: itensPedido.filter(e => e.gps),
        amostras: itensAmostra.filter(e => e.gps),
        cobrancas: itensCobranca.filter(e => e.gps),
        semGps: todos.filter(e => !e.gps),
        geocodificadas: todos.filter(e => e.origemGps === 'endereco').length,
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

// Local único do cliente — a chave que mantém pedido+amostra+cobrança do mesmo
// cliente SEMPRE juntos (1 parada). Amostra de lead agrupa pelo lead; item sem
// cliente nem lead vira um local próprio.
const chaveLocal = (i) => i.clienteId ? `c:${i.clienteId}` : (i.leadId ? `l:${i.leadId}` : `i:${idDoItem(i)}`);

// Agrupa itens posicionados em locais (paradas): [{ gps, itens: [...] }]
function agruparPorLocal(itens) {
    const locais = [];
    const porChave = new Map();
    for (const item of itens) {
        const k = chaveLocal(item);
        let loc = porChave.get(k);
        if (!loc) {
            loc = { chave: k, gps: item.gps, itens: [] };
            porChave.set(k, loc);
            locais.push(loc);
        }
        loc.itens.push(item);
    }
    return locais;
}

// Roteirizações salvas que PODEM conter os pedidos remanejados.
// Antes isto era um `findMany()` sem `where`: trazia a rota de TODOS os
// vendedores (cada linha carrega a sequência inteira em JSON) a cada aplicação
// da divisão. Agora são duas peneiras somadas:
//   1) as rotas dos MOTORISTAS das cargas envolvidas — a rota salva do motorista
//      é montada com os pedidos das cargas dele (routes/roteirizacao.js);
//   2) as rotas que citam algum dos pedidos movidos, filtradas DENTRO do banco
//      (jsonb). Cobre o caso da carga que trocou de motorista depois que a rota
//      foi organizada. Se esta consulta falhar, sobra a peneira 1 (best-effort).
async function rotasComPedidos(pedidoIds, cargasAfetadas) {
    const filtros = [];

    if (cargasAfetadas?.length) {
        const cargas = await prisma.embarque.findMany({
            where: { id: { in: cargasAfetadas } },
            select: { responsavelId: true }
        });
        const vendedorIds = [...new Set(cargas.map(c => c.responsavelId).filter(Boolean))];
        if (vendedorIds.length) filtros.push({ vendedorId: { in: vendedorIds } });
    }

    try {
        const linhas = await prisma.$queryRaw`
            SELECT id FROM roteirizacoes
             WHERE (jsonb_typeof(sequencia) = 'array'
                    AND EXISTS (SELECT 1 FROM jsonb_array_elements(sequencia) it
                                 WHERE it->>'pedidoId' = ANY(${pedidoIds})))
                OR (jsonb_typeof("semGPS") = 'array'
                    AND EXISTS (SELECT 1 FROM jsonb_array_elements("semGPS") it
                                 WHERE it->>'pedidoId' = ANY(${pedidoIds})))`;
        const ids = linhas.map(l => l.id);
        if (ids.length) filtros.push({ id: { in: ids } });
    } catch (err) {
        console.error('[EmbarquesMapa] Filtro jsonb das roteirizações falhou (segue pelas cargas):', err.message);
    }

    if (!filtros.length) return [];
    return prisma.roteirizacao.findMany({ where: filtros.length === 1 ? filtros[0] : { OR: filtros } });
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
                        pedidos: { where: whereElegivelNaCarga() },
                        amostras: { where: { status: { in: AMOSTRA_STATUS_NA_CARGA } } },
                        // Cobranças: sem filtro de status, EXATAMENTE a mesma
                        // consulta que lista as cobranças do mapa (carregarItens)
                        // e a do painel da carga. Contador e pinos batem sempre.
                        cobrancasRota: true
                    }
                }
            }
        });

        const { entregas, amostras, cobrancas, semGps } =
            await carregarItens(cargasDb.map(c => c.id), { de: entregaDe, ate: entregaAte });

        res.json({
            cargas: cargasDb.map(c => ({
                id: c.id,
                numero: c.numero,
                dataSaida: c.dataSaida,
                versao: c.versao,
                ultimaImpressaoVersao: c.ultimaImpressaoVersao,
                responsavel: c.responsavel ? { id: c.responsavel.id, nome: c.responsavel.nome } : null,
                qtdPedidos: c._count.pedidos,
                qtdAmostras: c._count.amostras,
                qtdCobrancas: c._count.cobrancasRota
            })),
            entregas,
            amostras,
            cobrancas,
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
// Parada = LOCAL único do cliente: pedido+amostra+cobrança do mesmo cliente
// contam como UMA parada e ficam sempre no MESMO grupo.
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

        // Carregar itens + geocodificar ANTES de pegar o lock: essa etapa não usa
        // OSRM (é banco + Nominatim a 1 req/s, até GEOCODE_BUDGET_MS) e segurar o
        // lock durante ela fazia o "Organizar Rota" do motorista levar 423 por até
        // 15s à toa. O lock só cobre as chamadas de OSRM (Table/Trip), abaixo.
        const avisos = [];
        const { entregas, amostras, cobrancas, semGps, geocodificadas, geocodePendentes } =
            await carregarItens(embarqueIds, { de: entregaDe, ate: entregaAte });

        if (geocodificadas > 0) {
            avisos.push(`${geocodificadas} item(ns) posicionado(s) pelo endereço escrito do cadastro (posição aproximada, cliente sem ponto GPS).`);
        }
        if (geocodePendentes > 0) {
            avisos.push(`${geocodePendentes} endereço(s) ainda não geocodificado(s) — tente de novo em instantes para incluí-los.`);
        }

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
            const idxGrupo = new Map(embarqueIds.map((id, i) => [id, i]));

            // paradas = LOCAIS únicos (cliente/lead) dos itens com posição;
            // índice na matriz = posição no array + 1 (0 = base)
            const locais = agruparPorLocal([...entregas, ...amostras, ...cobrancas]);

            // Local com item travado (já roteirizado/entregue/cobrado) em alguma
            // carga do arranjo fica preso à carga desse item — os itens livres do
            // mesmo cliente vão juntos para lá.
            const fixos = [];
            let locaisComTravaConflitante = 0;
            locais.forEach((loc, i) => {
                const cargasTravadas = [...new Set(
                    loc.itens
                        .filter(it => it.travado && it.embarqueId && idxGrupo.has(it.embarqueId))
                        .map(it => it.embarqueId)
                )];
                if (cargasTravadas.length) fixos.push({ parada: i + 1, grupo: idxGrupo.get(cargasTravadas[0]) });
                if (cargasTravadas.length > 1) locaisComTravaConflitante++;
            });
            if (locaisComTravaConflitante) {
                avisos.push(`${locaisComTravaConflitante} cliente(s) têm itens já saídos/trabalhados em cargas diferentes — cada item travado permanece na própria carga.`);
            }

            const travadosSemGps = semGps.filter(e => e.travado && e.embarqueId && idxGrupo.has(e.embarqueId));
            if (travadosSemGps.length) {
                avisos.push(`${travadosSemGps.length} item(ns) sem posição no mapa já roteirizado(s)/concluído(s) permanecem na própria carga, fora do cálculo de rota.`);
            }
            if (semGps.length - travadosSemGps.length > 0) {
                avisos.push(`${semGps.length - travadosSemGps.length} item(ns) sem posição ficaram fora da divisão — veja a lista semGps.`);
            }

            const pontos = [osrm.BASE_EMPRESA, ...locais.map(l => l.gps)];
            const { matriz, precisao } = await montarMatriz(pontos, avisos);

            const { grupos } = particionarParadas(matriz, embarqueIds.length, { fixos });

            // Distribui os ITENS: cada local leva todos os seus itens para o grupo
            // sorteado — exceto item TRAVADO em carga do arranjo, que permanece
            // listado na própria carga (não dá para movê-lo de verdade).
            const itensPorGrupo = embarqueIds.map(() => []);
            const stopsPorGrupo = embarqueIds.map(() => []);
            for (let g = 0; g < embarqueIds.length; g++) {
                for (const idxLocal of grupos[g]) {
                    const loc = locais[idxLocal - 1];
                    stopsPorGrupo[g].push(loc);
                    for (const item of loc.itens) {
                        const destino = (item.travado && item.embarqueId && idxGrupo.has(item.embarqueId))
                            ? idxGrupo.get(item.embarqueId)
                            : g;
                        itensPorGrupo[destino].push(item);
                    }
                }
            }
            // Travado sem posição continua pertencendo ao grupo da própria carga
            for (const e of travadosSemGps) {
                itensPorGrupo[idxGrupo.get(e.embarqueId)].push(e);
            }

            const gruposResp = [];
            for (let g = 0; g < embarqueIds.length; g++) {
                const med = await medirGrupo(stopsPorGrupo[g].map(l => l.gps), precisao, avisos);
                const itensG = itensPorGrupo[g];
                const carga = cargaPorId.get(embarqueIds[g]);
                gruposResp.push({
                    embarqueId: embarqueIds[g],
                    motorista: carga?.responsavel?.nome || null,
                    // Compat: pedidoIds continua existindo (só os pedidos do grupo)
                    pedidoIds: itensG.filter(i => i.tipo === 'pedido').map(i => i.pedidoId),
                    // Aditivo: todos os itens do grupo, com tipo
                    itens: itensG.map(i => ({ tipo: i.tipo, id: idDoItem(i) })),
                    paradas: stopsPorGrupo[g].length, // locais únicos (clientes) do grupo
                    distanciaKm: med.distanciaKm,
                    duracaoMin: med.duracaoMin,
                    previsaoRetorno: calcularRetorno(horaSaida, med.duracaoMin, tempoParadaMin, stopsPorGrupo[g].length),
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
                    preserva: 'Itens já roteirizados, entregues ou cobrados permanecem na carga atual; pedido, amostra e cobrança do MESMO cliente ficam sempre no mesmo grupo (uma parada por cliente)',
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
// body: { grupos: [{ embarqueId, pedidoIds?, itens? }], horaSaida, tempoParadaMin }
//   - pedidoIds (formato antigo) e itens [{ tipo, id }] podem vir juntos.
//   - Paradas contam por LOCAL único do cliente (pedido+amostra do mesmo
//     cliente = 1 parada).
// ==========================================
router.post('/estimar-rotas', verificarAuth, checkAcessoEmbarque, async (req, res) => {
    try {
        const { grupos, horaSaida, tempoParadaMin = 10 } = req.body || {};
        if (!Array.isArray(grupos) || grupos.length === 0) {
            return res.status(400).json({ error: 'Informe grupos: [{ embarqueId, pedidoIds | itens }].' });
        }

        // Normaliza cada grupo para itens [{ tipo, id }] (compat com pedidoIds)
        const gruposNorm = grupos.map(g => {
            const itens = [];
            const vistos = new Set();
            const add = (tipo, id) => {
                if (!id || !TIPOS_VALIDOS.has(tipo)) return;
                const k = `${tipo}:${id}`;
                if (vistos.has(k)) return;
                vistos.add(k);
                itens.push({ tipo, id });
            };
            (Array.isArray(g?.pedidoIds) ? g.pedidoIds : []).forEach(id => add('pedido', id));
            (Array.isArray(g?.itens) ? g.itens : []).forEach(i => {
                if (!i || typeof i !== 'object') return;
                const tipo = i.tipo || 'pedido';
                add(tipo, i.id || i.pedidoId || i.amostraId || i.cobrancaRotaId);
            });
            return { embarqueId: g?.embarqueId || null, itens };
        });

        const idsPorTipo = { pedido: new Set(), amostra: new Set(), cobranca: new Set() };
        for (const g of gruposNorm) for (const i of g.itens) idsPorTipo[i.tipo].add(i.id);

        const [pedidos, amostrasDb, cobrancasDb] = await Promise.all([
            idsPorTipo.pedido.size ? prisma.pedido.findMany({
                where: { id: { in: [...idsPorTipo.pedido] } }, select: SELECT_PEDIDO_MAPA
            }) : [],
            idsPorTipo.amostra.size ? prisma.amostra.findMany({
                where: { id: { in: [...idsPorTipo.amostra] } }, select: SELECT_AMOSTRA_MAPA
            }) : [],
            idsPorTipo.cobranca.size ? prisma.cobrancaRota.findMany({
                where: { id: { in: [...idsPorTipo.cobranca] } }, select: SELECT_COBRANCA_MAPA
            }) : []
        ]);

        const itemPorChave = new Map();
        const clientePorItem = new Map();
        for (const p of pedidos) {
            const it = montarEntrega(p);
            itemPorChave.set(`pedido:${p.id}`, it);
            clientePorItem.set(it, p.cliente);
        }
        for (const a of amostrasDb) {
            const it = montarAmostra(a);
            itemPorChave.set(`amostra:${a.id}`, it);
            clientePorItem.set(it, a.cliente);
        }
        for (const c of cobrancasDb) {
            const it = montarCobranca(c);
            itemPorChave.set(`cobranca:${c.id}`, it);
            clientePorItem.set(it, c.parcela?.contaReceber?.cliente);
        }

        const embarqueIdsValidos = [...new Set(gruposNorm.map(g => g.embarqueId).filter(Boolean))];
        const cargas = embarqueIdsValidos.length ? await prisma.embarque.findMany({
            where: { id: { in: embarqueIdsValidos } },
            include: { responsavel: { select: { nome: true } } }
        }) : [];
        const cargaPorId = new Map(cargas.map(c => [c.id, c]));

        // Geocodificação ANTES do lock (mesmo motivo do /sugerir-divisao: ela não
        // usa OSRM e pode levar segundos; o lock é só para Table/Trip).
        const avisos = [];
        // Posiciona quem não tem Ponto_GPS pelo endereço (mesma régua do /mapa)
        await completarComGeocode([...itemPorChave.values()], clientePorItem);
        const geocodificadas = [...itemPorChave.values()].filter(e => e.origemGps === 'endereco').length;
        if (geocodificadas > 0) {
            avisos.push(`${geocodificadas} item(ns) posicionado(s) pelo endereço escrito do cadastro (posição aproximada, cliente sem ponto GPS).`);
        }

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
            const semGps = [];
            const gruposResp = [];
            for (const g of gruposNorm) {
                const posicionados = [];
                for (const ref of g.itens) {
                    const e = itemPorChave.get(`${ref.tipo}:${ref.id}`);
                    if (!e) {
                        // Compat: para pedido mantém o formato antigo { pedidoId, motivo }
                        semGps.push(ref.tipo === 'pedido'
                            ? { tipo: 'pedido', pedidoId: ref.id, motivo: 'pedido não encontrado' }
                            : { tipo: ref.tipo, id: ref.id, motivo: `${ref.tipo} não encontrada` });
                    } else if (e.gps) {
                        posicionados.push(e);
                    } else {
                        semGps.push(e);
                    }
                }
                // Parada = local único do cliente (pedido+amostra+cobrança juntos)
                const stops = agruparPorLocal(posicionados);
                const med = await medirGrupo(stops.map(s => s.gps), 'osrm', avisos);
                gruposResp.push({
                    embarqueId: g.embarqueId,
                    motorista: cargaPorId.get(g.embarqueId)?.responsavel?.nome || null,
                    pedidoIds: g.itens.filter(i => i.tipo === 'pedido').map(i => i.id),
                    itens: g.itens,
                    paradas: stops.length,
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
// body: {
//   atribuicoes: [{ tipo?: 'pedido'|'amostra'|'cobranca', id, embarqueId|null }],
//   esperado:    [{ tipo?, id, embarqueIdAtual }]
// }
// Compat: o formato antigo { pedidoId, embarqueId } / { pedidoId, embarqueIdAtual }
// continua aceito (tratado como tipo 'pedido').
// Regras por tipo:
//   pedido   → as de sempre (statusEntrega PENDENTE, elegibilidade p/ entrar);
//   amostra  → só LIBERADA se move (ENTREGUE não sai mais da carga);
//   cobranca → só PENDENTE se move; destino null = TIRA da carga APAGANDO a
//              CobrancaRota (mesma régua do DELETE /cobrancas-rota/:id — cobrança
//              pendente fora de carga não existe).
// 409 = o estado do banco divergiu do que a tela viu (NADA é aplicado).
// ==========================================
router.post('/aplicar-divisao', verificarAuth, checkAcessoEmbarque, async (req, res) => {
    try {
        const { atribuicoes, esperado } = req.body || {};
        if (!Array.isArray(atribuicoes) || atribuicoes.length === 0) {
            return res.status(400).json({ error: 'Informe atribuicoes: [{ tipo, id, embarqueId|null }] (ou o formato antigo { pedidoId, embarqueId }).' });
        }
        if (!Array.isArray(esperado)) {
            return res.status(400).json({ error: 'Informe esperado: [{ tipo, id, embarqueIdAtual }] (trava contra edição simultânea).' });
        }

        // Normalização (compat com { pedidoId }): tudo vira { tipo, id, ... }
        const normalizar = (a, campoCarga) => {
            if (!a || typeof a !== 'object') return null;
            const tipo = a.tipo || 'pedido';
            if (!TIPOS_VALIDOS.has(tipo)) return null;
            const id = a.id || a.pedidoId || a.amostraId || a.cobrancaRotaId || null;
            if (!id) return null;
            return { tipo, id, [campoCarga]: a[campoCarga] || null };
        };
        const chave = (i) => `${i.tipo}:${i.id}`;

        const itens = atribuicoes.map(a => normalizar(a, 'embarqueId'));
        if (itens.some(i => !i)) {
            return res.status(400).json({ error: 'Toda atribuição precisa de id e tipo válido (pedido, amostra ou cobranca).' });
        }
        if (new Set(itens.map(chave)).size !== itens.length) {
            return res.status(400).json({ error: 'Há item repetido em atribuicoes.' });
        }

        const esperadoNorm = esperado.map(e => normalizar(e, 'embarqueIdAtual')).filter(Boolean);
        const esperadoPorChave = new Map(esperadoNorm.map(e => [chave(e), e.embarqueIdAtual || null]));
        const semEsperado = itens.filter(i => !esperadoPorChave.has(chave(i)));
        if (semEsperado.length) {
            return res.status(400).json({
                error: 'Todo item em atribuicoes precisa constar em esperado (com a carga em que a tela o viu).',
                // Compat: campo antigo com os pedidos + campo novo com todos os itens
                pedidosSemEsperado: semEsperado.filter(i => i.tipo === 'pedido').map(i => i.id),
                itensSemEsperado: semEsperado.map(i => ({ tipo: i.tipo, id: i.id }))
            });
        }

        const idsPorTipo = {
            pedido: itens.filter(i => i.tipo === 'pedido').map(i => i.id),
            amostra: itens.filter(i => i.tipo === 'amostra').map(i => i.id),
            cobranca: itens.filter(i => i.tipo === 'cobranca').map(i => i.id)
        };

        const SELECT_PEDIDO_APLICAR = {
            id: true, numero: true, embarqueId: true, situacaoCA: true, statusEnvio: true,
            especial: true, bonificacao: true, cancelado: true, devolucaoFinalizada: true,
            statusEntrega: true,
            cliente: { select: { NomeFantasia: true, Nome: true } }
        };
        const SELECT_AMOSTRA_APLICAR = {
            id: true, numero: true, status: true, embarqueId: true,
            cliente: { select: { NomeFantasia: true, Nome: true } },
            lead: { select: { nomeEstabelecimento: true } }
        };
        const SELECT_COBRANCA_APLICAR = {
            id: true, status: true, embarqueId: true,
            parcela: {
                select: {
                    numeroParcela: true,
                    contaReceber: {
                        select: {
                            cliente: { select: { NomeFantasia: true, Nome: true } },
                            pedido: { select: { numero: true } }
                        }
                    }
                }
            }
        };

        const buscarRegistros = async (client) => {
            const [pedidos, amostras, cobrancas] = await Promise.all([
                idsPorTipo.pedido.length ? client.pedido.findMany({
                    where: { id: { in: idsPorTipo.pedido } }, select: SELECT_PEDIDO_APLICAR
                }) : [],
                idsPorTipo.amostra.length ? client.amostra.findMany({
                    where: { id: { in: idsPorTipo.amostra } }, select: SELECT_AMOSTRA_APLICAR
                }) : [],
                idsPorTipo.cobranca.length ? client.cobrancaRota.findMany({
                    where: { id: { in: idsPorTipo.cobranca } }, select: SELECT_COBRANCA_APLICAR
                }) : []
            ]);
            const porChave = new Map();
            pedidos.forEach(p => porChave.set(`pedido:${p.id}`, p));
            amostras.forEach(a => porChave.set(`amostra:${a.id}`, a));
            cobrancas.forEach(c => porChave.set(`cobranca:${c.id}`, c));
            return porChave;
        };

        const etiquetaDe = (tipo, reg) =>
            tipo === 'pedido' ? etiquetaPedido(reg)
                : tipo === 'amostra' ? etiquetaAmostra(reg)
                    : etiquetaCobranca(reg);
        const clienteDe = (tipo, reg) => {
            if (tipo === 'cobranca') {
                const cli = reg.parcela?.contaReceber?.cliente;
                return cli?.NomeFantasia || cli?.Nome || null;
            }
            return reg.cliente?.NomeFantasia || reg.cliente?.Nome || reg.lead?.nomeEstabelecimento || null;
        };
        const NOME_TIPO = { pedido: 'pedido', amostra: 'amostra', cobranca: 'cobrança' };
        // "O pedido #123" / "A amostra AM#7" / "A cobrança CB#9" — para as mensagens
        // de conflito ficarem em português de gente.
        const ARTIGO_TIPO = { pedido: 'O', amostra: 'A', cobranca: 'A' };
        const DE_TIPO = { pedido: 'do pedido', amostra: 'da amostra', cobranca: 'da cobrança' };
        const FLEX = {
            pedido: { apagado: 'apagado', alterado: 'alterado' },
            amostra: { apagado: 'apagada', alterado: 'alterada' },
            cobranca: { apagado: 'apagada', alterado: 'alterada' }
        };
        const comArtigo = (tipo, etiq) => `${ARTIGO_TIPO[tipo]} ${NOME_TIPO[tipo]}${etiq ? ` ${etiq}` : ''}`;
        const RECARREGUE = 'Nada foi aplicado — recarregue o mapa e tente de novo.';

        // Motivo de bloqueio de amostra/cobrança (vale para entrar E sair — espelha
        // POST /:id/amostras e o DELETE /cobrancas-rota/:id do fluxo clássico).
        const motivoBloqueioAmostra = (a) =>
            a.status === AMOSTRA_STATUS_MOVIVEL ? null
                : a.status === 'ENTREGUE' ? 'amostra já entregue — não sai mais da carga'
                    : `amostra não está liberada (status ${a.status})`;
        const motivoBloqueioCobranca = (c) =>
            c.status === 'PENDENTE' ? null
                : c.status === 'COBRADA' ? 'cobrança já registrada na rua — aguarda a baixa no caixa'
                    : c.status === 'BAIXADA' ? 'cobrança já baixada no caixa'
                        : 'cobrança registrada como não cobrada';

        // Situação do item mudou (não é regra de elegibilidade, é estado novo):
        // entrega que já saiu, amostra entregue, cobrança trabalhada na rua.
        const motivoSituacao = (tipo, reg) =>
            tipo === 'amostra' ? motivoBloqueioAmostra(reg)
                : tipo === 'cobranca' ? motivoBloqueioCobranca(reg)
                    : (reg.statusEntrega !== 'PENDENTE'
                        ? `entrega já ${reg.statusEntrega} — não sai mais da carga`
                        : null);

        // ── Conflito = o banco divergiu do que a tela viu ────────────────────
        // Os TRÊS casos (item sumiu · mudou de carga · mudou de situação) saem
        // SEMPRE em 409 com o array `conflitos`, no mesmo formato dos
        // `bloqueados` ({ pedido/etiqueta, cliente, motivo }) + o texto pronto
        // em `error`. Antes "mudou de situação" saía 400 e a tela — que só sabe
        // tratar 409 e só lê `conflitos` — engolia a explicação.
        const novoConflito = ({ tipo, id, reg, embarqueIdAtual = null, motivo, frase }) => ({
            tipo,
            id,
            ...(tipo === 'pedido' ? { pedidoId: id } : {}), // compat
            pedido: reg ? etiquetaDe(tipo, reg) : null,     // compat: o campo sempre se chamou "pedido"
            etiqueta: reg ? etiquetaDe(tipo, reg) : null,
            cliente: reg ? clienteDe(tipo, reg) : null,
            embarqueIdAtual: embarqueIdAtual || null,
            motivo,
            frase
        });
        const conflitoSumiu = (tipo, id) => novoConflito({
            tipo, id, reg: null,
            motivo: `${NOME_TIPO[tipo]} não existe mais`,
            frase: `${comArtigo(tipo, null)} não existe mais (foi ${FLEX[tipo].apagado} enquanto você organizava).`
        });
        const conflitoCarga = (tipo, id, reg) => novoConflito({
            tipo, id, reg, embarqueIdAtual: reg.embarqueId,
            motivo: `a carga ${DE_TIPO[tipo]} mudou desde que a tela foi carregada`,
            frase: `${comArtigo(tipo, etiquetaDe(tipo, reg))} mudou de carga enquanto você organizava.`
        });
        const conflitoSituacao = (tipo, id, reg, motivo) => novoConflito({
            tipo, id, reg, embarqueIdAtual: reg.embarqueId, motivo,
            frase: `${comArtigo(tipo, etiquetaDe(tipo, reg))} mudou de situação enquanto você organizava: ${motivo}.`
        });
        // Texto de `error`: a frase do primeiro conflito + quantos mais mudaram.
        const textoConflitos = (lista) => {
            if (!lista.length) return `O arranjo mudou desde que a tela foi carregada. ${RECARREGUE}`;
            const [primeiro, ...resto] = lista;
            const extra = resto.length
                ? ` E mais ${resto.length} item(ns) mudaram (${resto.map(c => c.etiqueta || c.id).join(', ')}).`
                : '';
            return `${primeiro.frase}${extra} ${RECARREGUE}`;
        };

        const porChave = await buscarRegistros(prisma);

        // 1) Trava otimista: banco divergiu da tela → 409 com a lista, NADA aplicado
        const conflitos = [];
        for (const it of itens) {
            const reg = porChave.get(chave(it));
            if (!reg) {
                conflitos.push(conflitoSumiu(it.tipo, it.id));
                continue;
            }
            if ((reg.embarqueId || null) !== esperadoPorChave.get(chave(it))) {
                conflitos.push(conflitoCarga(it.tipo, it.id, reg));
            }
        }
        if (conflitos.length) {
            return res.status(409).json({ error: textoConflitos(conflitos), conflitos });
        }

        // 2) Cargas de destino precisam existir
        const destinos = [...new Set(itens.map(a => a.embarqueId).filter(Boolean))];
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
        const mudancas = itens
            .map(a => ({
                tipo: a.tipo, id: a.id,
                embarqueId: a.embarqueId || null,
                atual: porChave.get(chave(a)).embarqueId || null
            }))
            .filter(a => a.embarqueId !== a.atual)
            .sort((a, b) => chave(a).localeCompare(chave(b)));
        if (!mudancas.length) {
            return res.json({ message: 'Nada a alterar — o arranjo já está aplicado.', aplicadas: 0, cargasAfetadas: [] });
        }

        // 4) Validações por tipo (pré-checagem fora da transação, para responder
        //    com a lista completa). Pedido: entrega já roteirizada/concluída NUNCA
        //    muda de carga (mesma regra do DELETE /:id/pedidos/:pedidoId) +
        //    revalidação de aptidão para quem entra em carga (bloqueadosParaEmbarque,
        //    sem contar as cargas do próprio arranjo). Amostra: só LIBERADA.
        //    Cobrança: só PENDENTE.
        //    "Mudou de situação" (entrega já saiu, amostra entregue, cobrança
        //    trabalhada na rua) NÃO é regra de elegibilidade: é o estado tendo
        //    mudado debaixo da tela → 409 + `conflitos`, junto com "sumiu" e
        //    "mudou de carga". O 400 + `bloqueados` fica só para o que é regra
        //    permanente (Delivery, cancelado, especial sem aprovação…), que
        //    recarregar o mapa não resolve.
        const bloqueados = [];
        const conflitosSituacao = [];
        for (const m of mudancas) {
            const reg = porChave.get(chave(m));
            const motivo = motivoSituacao(m.tipo, reg);
            if (motivo) conflitosSituacao.push(conflitoSituacao(m.tipo, m.id, reg, motivo));
        }
        if (conflitosSituacao.length) {
            // Estado velho na tela tem precedência: o resto do arranjo também
            // pode estar desatualizado. NADA é aplicado.
            return res.status(409).json({ error: textoConflitos(conflitosSituacao), conflitos: conflitosSituacao });
        }
        const cargasArranjo = new Set([
            ...destinos,
            ...[...porChave.values()].map(r => r.embarqueId).filter(Boolean)
        ]);
        const pedidosEntrandoEmCarga = mudancas.filter(m => m.tipo === 'pedido' && m.embarqueId).map(m => m.id);
        if (pedidosEntrandoEmCarga.length) {
            const doHelper = await bloqueadosParaEmbarque(pedidosEntrandoEmCarga, { cargasPermitidas: cargasArranjo });
            bloqueados.push(...doHelper.map(b => ({ tipo: 'pedido', etiqueta: b.pedido, ...b })));
        }
        if (bloqueados.length) {
            return res.status(400).json({
                error: `Não dá para aplicar: ${bloqueados.map(b => `${b.pedido} (${b.motivo})`).join(', ')}.`,
                bloqueados
            });
        }

        // 5) Prepara o histórico. Na transação ficam SÓ a revalidação e a escrita
        //    dos três tipos (o que é atômico de verdade); versão/log das cargas e a
        //    limpeza do cache de rota rodam DEPOIS, best-effort — falha neles
        //    nunca desfaz o remanejo. Não há rede dentro da transação.
        const cargasAfetadas = [...new Set(mudancas.flatMap(m => [m.atual, m.embarqueId].filter(Boolean)))];
        const alteracoesPorCarga = new Map();
        // Cargas em que mudou pedido/amostra sobem a VERSÃO (mudam a folha
        // impressa); carga afetada só por cobrança recebe apenas o registro no
        // histórico, sem subir versão (mesma régua do routes/cobrancasRota.js —
        // cobrança não dispara o aviso de "reimprimir").
        const cargasComBumpDeVersao = new Set();
        for (const m of mudancas) {
            const etiq = etiquetaDe(m.tipo, porChave.get(chave(m)));
            for (const [cargaId, papel] of [[m.atual, 'sairam'], [m.embarqueId, 'entraram']]) {
                if (!cargaId) continue;
                if (!alteracoesPorCarga.has(cargaId)) {
                    alteracoesPorCarga.set(cargaId, { sairam: [], entraram: [], porTipo: { pedidos: 0, amostras: 0, cobrancas: 0 } });
                }
                const alt = alteracoesPorCarga.get(cargaId);
                alt[papel].push(etiq);
                alt.porTipo[m.tipo === 'pedido' ? 'pedidos' : m.tipo === 'amostra' ? 'amostras' : 'cobrancas']++;
                if (m.tipo !== 'cobranca') cargasComBumpDeVersao.add(cargaId);
            }
        }

        await prisma.$transaction(async (tx) => {
            // Revalida tudo no instante da escrita. updateMany/deleteMany com o
            // embarqueId esperado (e o status exigido) no where é a trava real:
            // sob corrida, somente uma transação altera cada item.
            const atualPorChave = await buscarRegistros(tx);

            const delivery = idsPorTipo.pedido.length ? await tx.deliveryStatus.findMany({
                where: { pedidoId: { in: idsPorTipo.pedido } }, select: { pedidoId: true }
            }) : [];
            const deliveryIds = new Set(delivery.map(d => d.pedidoId));

            // Relê UM item para explicar por que a escrita guardada não pegou.
            const relerItem = (m) =>
                m.tipo === 'pedido' ? tx.pedido.findUnique({ where: { id: m.id }, select: SELECT_PEDIDO_APLICAR })
                    : m.tipo === 'amostra' ? tx.amostra.findUnique({ where: { id: m.id }, select: SELECT_AMOSTRA_APLICAR })
                        : tx.cobrancaRota.findUnique({ where: { id: m.id }, select: SELECT_COBRANCA_APLICAR });

            // Erro 409 pronto (com a lista `conflitos` que a tela lê) a partir de
            // um ou mais conflitos já classificados.
            const erroConflito = (lista) => {
                const err = new Error('CONFLITO_DIVISAO');
                err.statusCode = 409;
                err.conflitos = lista;
                err.detalhe = textoConflitos(lista);
                return err;
            };

            // Texto preciso do 409 na hora da ESCRITA (o guard do updateMany não
            // pegou): distingue "outro operador mexeu na CARGA" de "o STATUS do
            // item mudou" (amostra entregue / cobrança registrada na rua pelo
            // motorista). Nos dois casos NADA é aplicado — o que muda é só a
            // explicação, para não dizer "a carga mudou" quando não mudou.
            const conflito = async (m, regConhecido) => {
                let agora = null;
                try { agora = await relerItem(m); } catch { /* segue com o que se sabe */ }
                if (!agora) {
                    // Sem releitura não dá para montar etiqueta/cliente; o
                    // regConhecido (leitura do início da transação) cobre o texto.
                    return erroConflito([regConhecido
                        ? novoConflito({
                            tipo: m.tipo, id: m.id, reg: regConhecido,
                            motivo: `${NOME_TIPO[m.tipo]} não existe mais`,
                            frase: `${comArtigo(m.tipo, etiquetaDe(m.tipo, regConhecido))} não existe mais (foi ${FLEX[m.tipo].apagado} enquanto você organizava).`
                        })
                        : conflitoSumiu(m.tipo, m.id)]);
                }
                if ((agora.embarqueId || null) !== (esperadoPorChave.get(chave(m)) || null)) {
                    return erroConflito([conflitoCarga(m.tipo, m.id, agora)]);
                }
                const motivo = motivoSituacao(m.tipo, agora);
                if (motivo) return erroConflito([conflitoSituacao(m.tipo, m.id, agora, motivo)]);
                return erroConflito([novoConflito({
                    tipo: m.tipo, id: m.id, reg: agora, embarqueIdAtual: agora.embarqueId,
                    motivo: `${NOME_TIPO[m.tipo]} ${FLEX[m.tipo].alterado} por outra pessoa`,
                    frase: `${comArtigo(m.tipo, etiquetaDe(m.tipo, agora))} foi ${FLEX[m.tipo].alterado} por outra pessoa enquanto você organizava.`
                })]);
            };

            // Conflito (estado divergiu: sumiu / mudou de carga / mudou de
            // situação) → 409 + `conflitos`. Impedimento (regra permanente de
            // elegibilidade) → 400 + `bloqueados`. Mesma separação da
            // pré-checagem, agora no instante da escrita.
            const conflitosTx = [];
            const impedimentos = [];
            for (const m of mudancas) {
                const reg = atualPorChave.get(chave(m));
                const esperadoAtual = esperadoPorChave.get(chave(m)) || null;
                if (!reg) { conflitosTx.push(conflitoSumiu(m.tipo, m.id)); continue; }
                if ((reg.embarqueId || null) !== esperadoAtual) {
                    conflitosTx.push(conflitoCarga(m.tipo, m.id, reg));
                    continue;
                }
                const mudouSituacao = motivoSituacao(m.tipo, reg);
                if (mudouSituacao) {
                    conflitosTx.push(conflitoSituacao(m.tipo, m.id, reg, mudouSituacao));
                    continue;
                }
                const impedir = (motivo) => impedimentos.push({
                    tipo: m.tipo,
                    pedido: etiquetaDe(m.tipo, reg),
                    etiqueta: etiquetaDe(m.tipo, reg),
                    cliente: clienteDe(m.tipo, reg),
                    motivo
                });

                // Amostra LIBERADA e cobrança PENDENTE já passaram na peneira de
                // situação acima — nada mais as impede de mudar de carga.
                if (m.tipo !== 'pedido') continue;

                // ── pedido (statusEntrega PENDENTE garantido acima) ──
                // Tirar da carga (destino null): mesma régua do DELETE clássico
                // (/:id/pedidos/:pedidoId) — só o statusEntrega importa. Cancelado/
                // devolvido/excluído PODE (e deve poder) sair da carga.
                if (!m.embarqueId) continue;
                // Entrar em carga: pedido do Delivery não entra, e vale a mesma
                // elegibilidade da listagem (faturado ou especial/bonificação aprovados).
                if (deliveryIds.has(reg.id)) impedir('pedido pertence ao fluxo de Delivery');
                else if (reg.cancelado) impedir('pedido cancelado');
                else if (reg.devolucaoFinalizada) impedir('pedido já devolvido');
                else if (reg.statusEnvio === 'EXCLUIDO') impedir('pedido excluído');
                else if (reg.especial && reg.statusEnvio === 'ENVIAR') impedir('especial pendente de aprovação');
                else if (reg.bonificacao && reg.statusEnvio === 'ENVIAR') impedir('bonificação pendente de aprovação');
                else if (!(reg.situacaoCA === 'FATURADO' ||
                    (reg.especial && reg.statusEnvio === 'RECEBIDO') || (reg.bonificacao && reg.statusEnvio === 'RECEBIDO'))) {
                    impedir('não está faturado nem aprovado para envio');
                }
            }
            if (conflitosTx.length) throw erroConflito(conflitosTx);
            if (impedimentos.length) {
                const err = new Error('ITENS_BLOQUEADOS');
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
                const whereGuard = { id: m.id, embarqueId: esperadoPorChave.get(chave(m)) };
                let alterado;
                if (m.tipo === 'pedido') {
                    alterado = await tx.pedido.updateMany({
                        where: whereGuard,
                        data: m.embarqueId ? { embarqueId: m.embarqueId, statusEntrega: 'PENDENTE' } : { embarqueId: null }
                    });
                } else if (m.tipo === 'amostra') {
                    alterado = await tx.amostra.updateMany({
                        where: { ...whereGuard, status: AMOSTRA_STATUS_MOVIVEL },
                        data: { embarqueId: m.embarqueId } // null = volta para "amostras livres"
                    });
                } else {
                    // cobranca: mover = trocar a carga; tirar da carga = APAGAR o
                    // registro (mesma régua do DELETE /cobrancas-rota/:id — não
                    // existe CobrancaRota pendente órfã de carga).
                    alterado = m.embarqueId
                        ? await tx.cobrancaRota.updateMany({
                            where: { ...whereGuard, status: 'PENDENTE' },
                            data: { embarqueId: m.embarqueId }
                        })
                        : await tx.cobrancaRota.deleteMany({
                            where: { ...whereGuard, status: 'PENDENTE' }
                        });
                }
                if (alterado.count !== 1) {
                    // count 0 = alguém mexeu no item entre a revalidação acima e
                    // esta escrita. Pode ter sido a CARGA (outro operador) ou o
                    // STATUS (amostra virou ENTREGUE, cobrança virou COBRADA no
                    // celular do motorista) — o guard de status pega os dois.
                    throw await conflito(m, atualPorChave.get(chave(m)));
                }
            }
        }, { timeout: 20000, maxWait: 10000 });

        // Versão + histórico das cargas afetadas (best-effort, fora da transação —
        // os helpers já engolem a própria falha sem afetar o remanejo aplicado).
        for (const [cargaId, alteracoes] of alteracoesPorCarga) {
            if (cargasComBumpDeVersao.has(cargaId)) {
                await registrarVersaoEmbarque(cargaId, 'DIVISAO_APLICADA', alteracoes, req.user.id);
            } else {
                // Só cobrança mudou: histórico sem subir a versão (não muda a folha)
                try {
                    const emb = await prisma.embarque.findUnique({ where: { id: cargaId }, select: { versao: true } });
                    await registrarLogEmbarque(cargaId, emb?.versao || 1, 'DIVISAO_APLICADA', alteracoes, req.user.id);
                } catch (e) {
                    console.error('[EmbarquesMapa] Falha no histórico de cobrança da carga (divisão JÁ aplicada):', e.message);
                }
            }
        }

        // Cache de rota dos motoristas (best-effort): pedido remanejado sai das
        // roteirizações salvas (Roteirizacao.sequencia/semGPS) para não deixar
        // parada fantasma no painel de quem já tinha organizado a rota. SÓ
        // pedidos: amostra/cobrança não entram na Roteirizacao (a rota salva
        // guarda apenas pedidoId — conferido em routes/roteirizacao.js).
        //
        // ⛔ NÃO recalculamos duracaoTotalMin nem distanciaTotalKm aqui (decisão
        // do dono, 08/2026). Somar as pernas que sobraram dá um número MENOR que
        // a verdade: a rota salva é montada como origem;…paradas…;BASE e o laço
        // de routes/roteirizacao.js grava em cada item só a perna que CHEGA nele
        // — a perna final de volta à base não é gravada em item nenhum (vive só
        // em rota.duration/rota.distance). Medido pelo QA: tirar 1 pedido de 13
        // devolvia 157,9 km / 281 min onde a rota refeita dá 205,7 km / 324 min
        // (−23%), e o mapa da expedição mostrava outro número ainda. Então:
        // mantemos os totais antigos (erram para o lado seguro) e marcamos
        // resumo.recalcularNecessario = true — o painel do motorista mostra
        // "a expedição mudou sua carga, organize a rota de novo" e a marca só
        // cai no POST /api/roteirizar (que refaz a rota no OSRM, com a volta).
        try {
            const movidosArr = [...new Set(mudancas.filter(m => m.tipo === 'pedido').map(m => m.id))];
            const movidos = new Set(movidosArr);
            if (movidos.size) {
                // Só as cargas que ganharam/perderam PEDIDO: mexer só em cobrança
                // não muda parada nenhuma da rota salva (ela só tem pedidoId).
                const cargasComPedidoMovido = [...new Set(
                    mudancas.filter(m => m.tipo === 'pedido')
                        .flatMap(m => [m.atual, m.embarqueId].filter(Boolean))
                )];
                const rotas = await rotasComPedidos(movidosArr, cargasComPedidoMovido);
                for (const rota of rotas) {
                    const seq = Array.isArray(rota.sequencia) ? rota.sequencia : [];
                    const sem = Array.isArray(rota.semGPS) ? rota.semGPS : [];
                    const resumoAtual = (rota.resumo && typeof rota.resumo === 'object') ? rota.resumo : {};
                    const temMovido = [...seq, ...sem].some(i => i?.pedidoId && movidos.has(i.pedidoId));

                    if (!temMovido) {
                        // A carga deste motorista mudou (tipicamente GANHOU um
                        // pedido), mas nenhuma parada da rota salva saiu: não há
                        // o que remover — só avisar que a rota está velha.
                        if (resumoAtual.recalcularNecessario === true) continue;
                        await prisma.roteirizacao.update({
                            where: { id: rota.id },
                            data: { resumo: { ...resumoAtual, recalcularNecessario: true } }
                        });
                        continue;
                    }

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
                                    ...resumoAtual,
                                    // Contagens: essas são fato, não estimativa.
                                    totalParadas: novaSeq.length,
                                    totalSemGPS: novoSem.length,
                                    // duracaoTotalMin / distanciaTotalKm: preservados
                                    // de propósito (ver comentário acima).
                                    recalcularNecessario: true
                                }
                            }
                        });
                    }
                }
            }
        } catch (eRota) {
            console.error('[EmbarquesMapa] Falha ao atualizar roteirizações salvas (cache — divisão JÁ aplicada):', eRota.message);
        }

        const porTipo = {
            pedidos: mudancas.filter(m => m.tipo === 'pedido').length,
            amostras: mudancas.filter(m => m.tipo === 'amostra').length,
            cobrancas: mudancas.filter(m => m.tipo === 'cobranca').length
        };
        const partes = [];
        if (porTipo.pedidos) partes.push(`${porTipo.pedidos} pedido(s)`);
        if (porTipo.amostras) partes.push(`${porTipo.amostras} amostra(s)`);
        if (porTipo.cobrancas) partes.push(`${porTipo.cobrancas} cobrança(s)`);
        res.json({
            message: `${partes.join(', ')} remanejado(s).`,
            aplicadas: mudancas.length,
            porTipo,
            cargasAfetadas
        });
    } catch (error) {
        if (error.statusCode === 409 || error.code === 'P2034') {
            return res.status(409).json({
                // error.detalhe diz o que mudou de verdade (sumiu × carga ×
                // situação do item); sem ele, cai no texto genérico de sempre.
                error: error.detalhe
                    || 'O arranjo mudou desde que a tela foi carregada. Recarregue o mapa e tente de novo — nada foi aplicado.',
                // A tela lê ESTE array; P2034 (deadlock/write conflict do Postgres)
                // não tem item identificado, então vai vazio e ela usa o `error`.
                conflitos: Array.isArray(error.conflitos) ? error.conflitos : []
            });
        }
        if (error.message === 'ITENS_BLOQUEADOS' || error.message === 'PEDIDOS_BLOQUEADOS') {
            return res.status(400).json({ error: 'Um ou mais itens não podem ser remanejados.', bloqueados: error.bloqueados });
        }
        if (error.message === 'CARGA_INEXISTENTE') {
            return res.status(400).json({ error: 'Uma ou mais cargas de destino não existem.' });
        }
        console.error('[EmbarquesMapa] Erro no aplicar-divisao:', error);
        res.status(500).json({ error: 'Erro ao aplicar a divisão.' });
    }
});

module.exports = router;
