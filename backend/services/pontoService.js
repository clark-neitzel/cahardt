const prisma = require('../config/database');

// ─── Helpers de data/hora (timezone São Paulo) ───────────────────────────────

// YYYY-MM-DD seguro no fuso de Brasília (espelha diarioService.getDataReferencia)
const getDataReferencia = (data) => {
    const d = data ? new Date(data) : new Date();
    const partes = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(d);
    const ano = partes.find(p => p.type === 'year').value;
    const mes = partes.find(p => p.type === 'month').value;
    const dia = partes.find(p => p.type === 'day').value;
    return `${ano}-${mes}-${dia}`;
};

// HH:MM no fuso de Brasília
const horaLocalHM = (data) => new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false
}).format(new Date(data));

const hmToMin = (hm) => {
    if (!hm) return null;
    const [h, m] = String(hm).split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
};

const minToHM = (min) => {
    if (min == null || isNaN(min)) return '—';
    const sinal = min < 0 ? '-' : '';
    const abs = Math.abs(Math.round(min));
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return `${sinal}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// ─── Geofence ────────────────────────────────────────────────────────────────

const parseLatLng = (s) => {
    if (!s) return null;
    const [lat, lng] = String(s).split(',').map(x => parseFloat(String(x).trim()));
    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng };
};

// Distância em metros entre dois pontos (Haversine)
const haversineMetros = (lat1, lng1, lat2, lng2) => {
    const R = 6371000;
    const toRad = (g) => (g * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

// Config da cerca da empresa (AppConfig: empresa_geofence)
const getGeofence = async () => {
    const cfg = await prisma.appConfig.findUnique({ where: { key: 'empresa_geofence' } });
    const v = (cfg && typeof cfg.value === 'object' && cfg.value) || {};
    return {
        lat: v.lat ?? null,
        lng: v.lng ?? null,
        raioMetros: Number(v.raioMetros ?? v.raio_metros ?? 100),
        bloquear: v.bloquear !== false, // padrão: bloqueia fora da cerca
        ativo: v.lat != null && v.lng != null
    };
};

// ─── Mapeamento de batida para a API ─────────────────────────────────────────

const mapBatida = (b) => ({
    id: b.id,
    tipo: b.tipo,
    hora: horaLocalHM(b.hora),
    horaISO: b.hora,
    latLng: b.latLng || null,
    distanciaMetros: b.distanciaMetros,
    dentroCerca: b.dentroCerca,
    origem: b.origem
});

// ─── Status / batidas do dia ─────────────────────────────────────────────────

const statusDoDia = async (funcionarioId, dataRef) => {
    const ref = dataRef || getDataReferencia();
    const batidas = await prisma.pontoRegistro.findMany({
        where: { funcionarioId, dataReferencia: ref },
        orderBy: { hora: 'asc' }
    });
    const dentro = batidas.length % 2 === 1; // ímpar = a última foi ENTRADA
    return {
        status: dentro ? 'DENTRO' : 'FORA',
        proximaAcao: dentro ? 'SAIDA' : 'ENTRADA',
        desde: dentro ? horaLocalHM(batidas[batidas.length - 1].hora) : null,
        batidasHoje: batidas.map(mapBatida)
    };
};

// ─── Registrar batida (link público) ─────────────────────────────────────────

const registrarBatida = async (funcionario, { latLng, origem = 'LINK', ajustadoPor = null } = {}) => {
    const ref = getDataReferencia();
    const geo = await getGeofence();
    const ponto = parseLatLng(latLng);

    let distanciaMetros = null;
    let dentroCerca = null;

    if (geo.ativo && origem === 'LINK') {
        if (!ponto) {
            // Cerca ativa exige GPS para registrar pelo link
            const err = new Error('Não foi possível obter sua localização. Ative o GPS e tente novamente.');
            err.status = 400;
            throw err;
        }
        distanciaMetros = haversineMetros(geo.lat, geo.lng, ponto.lat, ponto.lng);
        dentroCerca = distanciaMetros <= geo.raioMetros;
        if (!dentroCerca && geo.bloquear) {
            const err = new Error(`Você está a ${distanciaMetros} m da empresa. O ponto só pode ser batido a até ${geo.raioMetros} m.`);
            err.status = 403;
            err.distancia = distanciaMetros;
            throw err;
        }
    } else if (ponto) {
        distanciaMetros = geo.ativo ? haversineMetros(geo.lat, geo.lng, ponto.lat, ponto.lng) : null;
        dentroCerca = distanciaMetros != null ? distanciaMetros <= geo.raioMetros : null;
    }

    const count = await prisma.pontoRegistro.count({ where: { funcionarioId: funcionario.id, dataReferencia: ref } });
    const tipo = count % 2 === 0 ? 'ENTRADA' : 'SAIDA';

    return prisma.pontoRegistro.create({
        data: {
            funcionarioId: funcionario.id,
            dataReferencia: ref,
            tipo,
            latLng: ponto ? `${ponto.lat},${ponto.lng}` : null,
            distanciaMetros,
            dentroCerca,
            origem,
            ajustadoPor
        }
    });
};

// ─── Motor do cartão de ponto (janela móvel / banco / hora extra) ─────────────

// Carga prevista (minutos) de um dia a partir da jornada daquele dia da semana
const cargaDaJornada = (jornada) => {
    if (!jornada || jornada.folga) return 0;
    let total = 0;
    const p1 = hmToMin(jornada.saida1) - hmToMin(jornada.entrada1);
    if (!isNaN(p1) && p1 > 0) total += p1;
    const p2 = hmToMin(jornada.saida2) - hmToMin(jornada.entrada2);
    if (!isNaN(p2) && p2 > 0) total += p2;
    return total;
};

// Minutos trabalhados a partir das batidas do dia (pares entrada/saída)
const trabalhadoDasBatidas = (batidas) => {
    const ord = [...batidas].sort((a, b) => new Date(a.hora) - new Date(b.hora));
    let total = 0;
    for (let i = 0; i + 1 < ord.length; i += 2) {
        const ent = new Date(ord[i].hora).getTime();
        const sai = new Date(ord[i + 1].hora).getTime();
        if (sai > ent) total += (sai - ent) / 60000;
    }
    return Math.round(total);
};

// Monta o cartão do mês ("YYYY-MM")
const montarCartao = async (funcionarioId, mes) => {
    const funcionario = await prisma.funcionario.findUnique({
        where: { id: funcionarioId },
        include: { jornadas: true }
    });
    if (!funcionario) {
        const err = new Error('Funcionário não encontrado');
        err.status = 404;
        throw err;
    }

    const mesRef = mes || getDataReferencia().slice(0, 7);
    const jornadaPorDia = {};
    for (const j of funcionario.jornadas) jornadaPorDia[j.diaSemana] = j;

    const registros = await prisma.pontoRegistro.findMany({
        where: { funcionarioId, dataReferencia: { startsWith: mesRef } },
        orderBy: { hora: 'asc' }
    });
    const atestados = await prisma.funcionarioAtestado.findMany({ where: { funcionarioId } });

    // Agrupa batidas por dia
    const porDia = {};
    for (const r of registros) {
        (porDia[r.dataReferencia] = porDia[r.dataReferencia] || []).push(r);
    }

    // Dias com atestado (data inicial + dias)
    const diasAtestado = new Set();
    for (const a of atestados) {
        const base = new Date(a.dataInicio);
        for (let i = 0; i < (a.dias || 1); i++) {
            const d = new Date(base);
            d.setDate(d.getDate() + i);
            diasAtestado.add(getDataReferencia(d));
        }
    }

    const dias = Object.keys(porDia).sort();
    // Garante que dias com atestado dentro do mês apareçam mesmo sem batida
    for (const d of diasAtestado) {
        if (d.startsWith(mesRef) && !porDia[d]) dias.push(d);
    }
    dias.sort();

    const valorHora = Number(funcionario.salario) > 0 ? Number(funcionario.salario) / 220 : 0;

    let trabalhadoTotal = 0, previstoTotal = 0, saldoTotal = 0, extraMin = 0, faltas = 0;

    const linhas = dias.map((d) => {
        const batidas = porDia[d] || [];
        const diaSemana = new Date(`${d}T12:00:00`).getDay();
        const jornada = jornadaPorDia[diaSemana];
        const previsto = cargaDaJornada(jornada);
        const abonado = diasAtestado.has(d);

        let trabalhado = trabalhadoDasBatidas(batidas);
        let saldo = abonado ? 0 : trabalhado - previsto;

        // Janela móvel: saldo já é (trabalhado − carga), o que desloca naturalmente
        // o horário mantendo a carga diária. Sem móvel, o saldo é o mesmo total,
        // mas marcamos atraso se a 1ª batida passou da entrada prevista.
        let atraso = false;
        if (!funcionario.jornadaMovel && jornada && !jornada.folga && batidas.length) {
            const primeira = hmToMin(horaLocalHM(batidas[0].hora));
            const prevista = hmToMin(jornada.entrada1);
            if (prevista != null && primeira != null && primeira > prevista + 5) atraso = true;
        }

        if (!abonado) {
            trabalhadoTotal += trabalhado;
            previstoTotal += previsto;
            saldoTotal += saldo;
            if (saldo > 0) extraMin += saldo;
            if (previsto > 0 && trabalhado === 0) faltas += 1;
        }

        return {
            data: d,
            diaSemana,
            previstoMin: previsto,
            previsto: minToHM(previsto),
            trabalhadoMin: trabalhado,
            trabalhado: batidas.length ? minToHM(trabalhado) : (abonado ? 'abonado' : '—'),
            saldoMin: saldo,
            saldo: abonado ? 'abonado' : minToHM(saldo),
            abonado,
            atraso,
            folga: !!(jornada && jornada.folga),
            batidas: batidas.map(mapBatida)
        };
    });

    const extraValor = funcionario.tipoHoraExtra === 'PAGA'
        ? (extraMin / 60) * valorHora * 1.5
        : 0;

    return {
        funcionario: { id: funcionario.id, nome: funcionario.nome, tipoHoraExtra: funcionario.tipoHoraExtra },
        mes: mesRef,
        resumo: {
            trabalhadoMin: trabalhadoTotal,
            trabalhado: minToHM(trabalhadoTotal),
            previstoMin: previstoTotal,
            previsto: minToHM(previstoTotal),
            saldoMin: saldoTotal,
            saldo: minToHM(saldoTotal),                 // banco de horas do período
            extraMin,
            extra: minToHM(extraMin),                   // horas extras (quando tipo = PAGA)
            extraValor: Number(extraValor.toFixed(2)),
            faltas
        },
        linhas
    };
};

module.exports = {
    getDataReferencia,
    horaLocalHM,
    haversineMetros,
    parseLatLng,
    getGeofence,
    mapBatida,
    statusDoDia,
    registrarBatida,
    montarCartao
};
