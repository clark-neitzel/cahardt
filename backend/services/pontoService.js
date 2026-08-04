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
    origem: b.origem,
    obs: b.obs || ''
});

// ─── Status / batidas do dia ─────────────────────────────────────────────────

// Minutos entre a última batida e agora
const minutosDesde = (data) => Math.round((Date.now() - new Date(data).getTime()) / 60000);

const minutosParaTexto = (min) => {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
};

// Olha o dia e diz se tem algo estranho (o funcionário vê isso na tela do ponto).
// É o que faz o erro aparecer no MESMO DIA em vez de só no fechamento.
const conferirDia = (batidas) => {
    if (!batidas.length) return null;
    const ult = batidas[batidas.length - 1];
    const penult = batidas.length > 1 ? batidas[batidas.length - 2] : null;
    const desdeUlt = minutosDesde(ult.hora);

    if (penult && penult.tipo === ult.tipo) {
        const rot = ult.tipo === 'ENTRADA' ? 'entradas' : 'saídas';
        return {
            tipo: 'SEQUENCIA',
            texto: `Você registrou duas ${rot} seguidas (${horaLocalHM(penult.hora)} e ${horaLocalHM(ult.hora)}). Faltou registrar a outra ponta?`
        };
    }
    if (penult && Math.abs(new Date(ult.hora) - new Date(penult.hora)) < 2 * 60000) {
        return {
            tipo: 'DUPLICADA',
            texto: `Duas batidas em menos de 2 minutos (${horaLocalHM(penult.hora)} e ${horaLocalHM(ult.hora)}). Se foi toque repetido, peça o acerto.`
        };
    }
    if (batidas.length % 2 === 1 && desdeUlt >= 360) {
        return {
            tipo: 'ABERTO',
            texto: `Você está com entrada às ${horaLocalHM(ult.hora)} sem saída há ${minutosParaTexto(desdeUlt)}. Se esqueceu de bater, peça o acerto.`
        };
    }
    return null;
};

const statusDoDia = async (funcionarioId, dataRef) => {
    const ref = dataRef || getDataReferencia();
    const batidas = await prisma.pontoRegistro.findMany({
        where: { funcionarioId, dataReferencia: ref },
        orderBy: { hora: 'asc' }
    });
    const ultima = batidas.length ? batidas[batidas.length - 1] : null;
    // O estado vem do TIPO da última batida (não da contagem) — se alguém
    // esqueceu uma batida, o dia não fica invertido daqui pra frente.
    const dentro = !!ultima && ultima.tipo === 'ENTRADA';
    const trabalhadoMin = trabalhadoDasBatidas(batidas);

    return {
        data: ref,
        status: dentro ? 'DENTRO' : 'FORA',
        proximaAcao: dentro ? 'SAIDA' : 'ENTRADA',
        desde: dentro ? horaLocalHM(ultima.hora) : null,
        totalMin: trabalhadoMin,
        total: minToHM(trabalhadoMin),
        alerta: conferirDia(batidas),
        ultimaBatida: ultima ? { ...mapBatida(ultima), minutosAtras: minutosDesde(ultima.hora) } : null,
        batidasHoje: batidas.map(mapBatida)
    };
};

// ─── Registrar batida (link público) ─────────────────────────────────────────

const registrarBatida = async (funcionario, { latLng, origem = 'LINK', ajustadoPor = null, tipo = null } = {}) => {
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

    // O TIPO vem de quem bateu (a pessoa escolhe Entrada ou Saída na tela).
    // Sem tipo informado (importação CSV antiga), cai na alternância pela ordem.
    const doDia = await prisma.pontoRegistro.findMany({
        where: { funcionarioId: funcionario.id, dataReferencia: ref },
        orderBy: { hora: 'asc' }
    });
    const escolhido = String(tipo || '').toUpperCase();
    const tipoFinal = escolhido === 'ENTRADA' || escolhido === 'SAIDA'
        ? escolhido
        : (doDia.length % 2 === 0 ? 'ENTRADA' : 'SAIDA');

    // Trava do toque repetido: mesma pessoa, mesmo tipo, menos de 2 minutos.
    const ultima = doDia[doDia.length - 1];
    if (ultima && ultima.tipo === tipoFinal && Date.now() - new Date(ultima.hora).getTime() < 2 * 60000) {
        const err = new Error(`Você já registrou ${tipoFinal === 'ENTRADA' ? 'entrada' : 'saída'} às ${horaLocalHM(ultima.hora)}. Se precisar corrigir, use "pedir acerto".`);
        err.status = 409;
        throw err;
    }

    return prisma.pontoRegistro.create({
        data: {
            funcionarioId: funcionario.id,
            dataReferencia: ref,
            tipo: tipoFinal,
            latLng: ponto ? `${ponto.lat},${ponto.lng}` : null,
            distanciaMetros,
            dentroCerca,
            origem,
            ajustadoPor
        }
    });
};

// ─── Corrigir a última batida (janela curta, o próprio funcionário) ──────────
// Só a ÚLTIMA batida do dia e só nos primeiros minutos — é para consertar o
// toque errado na hora, não para mexer no ponto depois (isso é pedido de acerto).
const MINUTOS_CORRIGIR_ULTIMA = 10;

const corrigirUltimaBatida = async (funcionarioId, novoTipo) => {
    const tipo = String(novoTipo || '').toUpperCase();
    if (tipo !== 'ENTRADA' && tipo !== 'SAIDA') {
        const err = new Error('Tipo inválido.');
        err.status = 400;
        throw err;
    }
    const ref = getDataReferencia();
    const ultima = await prisma.pontoRegistro.findFirst({
        where: { funcionarioId, dataReferencia: ref },
        orderBy: { hora: 'desc' }
    });
    if (!ultima) {
        const err = new Error('Você ainda não bateu o ponto hoje.');
        err.status = 404;
        throw err;
    }
    if (minutosDesde(ultima.hora) > MINUTOS_CORRIGIR_ULTIMA) {
        const err = new Error(`A correção rápida vale só nos primeiros ${MINUTOS_CORRIGIR_ULTIMA} minutos. Use "pedir acerto".`);
        err.status = 403;
        throw err;
    }
    if (ultima.tipo === tipo) return ultima;

    return prisma.pontoRegistro.update({
        where: { id: ultima.id },
        data: { tipo, obs: [ultima.obs, 'corrigido pelo funcionário'].filter(Boolean).join(' · ') }
    });
};

// ─── Calendário do período ───────────────────────────────────────────────────

// Todos os dias entre de..ate (YYYY-MM-DD), inclusive — inclusive sábado e domingo
const listarDias = (de, ate) => {
    const dias = [];
    if (!de || !ate || de > ate) return dias;
    const d = new Date(`${de}T12:00:00`);
    const fim = new Date(`${ate}T12:00:00`);
    let guarda = 0;
    while (d <= fim && guarda++ < 800) {
        dias.push(d.toLocaleDateString('en-CA'));
        d.setDate(d.getDate() + 1);
    }
    return dias;
};

// Feriados da empresa (AppConfig: rh_feriados) → { 'YYYY-MM-DD': 'Natal' }
// Aceita { lista: [{ data, nome }] } ou um array simples de datas.
const getFeriados = async () => {
    const cfg = await prisma.appConfig.findUnique({ where: { key: 'rh_feriados' } });
    const v = cfg?.value;
    const bruto = Array.isArray(v) ? v : (Array.isArray(v?.lista) ? v.lista : []);
    const mapa = {};
    for (const item of bruto) {
        const data = typeof item === 'string' ? item : item?.data;
        if (!data) continue;
        mapa[String(data).slice(0, 10)] = (typeof item === 'object' && item?.nome) || 'Feriado';
    }
    return mapa;
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

// Rótulo humano de cada situação do dia
const ROTULO_SITUACAO = {
    TRABALHADO: 'Trabalhado',
    FALTA: 'Falta',
    ABONO: 'Abonado',
    ATESTADO: 'Atestado',
    FERIAS: 'Férias',
    FERIADO: 'Feriado',
    FOLGA: 'Folga',
    COMPENSADO: 'Compensado',
    FUTURO: 'A cumprir',        // dia de hoje ainda em aberto ou dia futuro do período
    AGUARDANDO: 'Aguardando importação', // bate no relógio e o arquivo ainda não entrou
    SEM_CONTROLE: 'Sem controle de ponto',
    SEM_VINCULO: 'Fora do contrato'
};

// Marcações que o RH pode aplicar a um dia (valem mais que o automático)
const TIPOS_MARCACAO = ['FALTA', 'ABONO', 'ATESTADO', 'FERIAS', 'FERIADO', 'FOLGA', 'COMPENSADO'];

// Dias pagos em que não há carga a cumprir (não descontam nada)
const SITUACOES_ABONADAS = ['ABONO', 'ATESTADO', 'FERIAS'];

const cent = (n) => Number((Number(n) || 0).toFixed(2));

/**
 * Monta o cartão de ponto de um PERÍODO (de..ate, YYYY-MM-DD) — todos os dias
 * aparecem, inclusive sábado e domingo. Dia útil sem batida vira FALTA; dia de
 * folga na escala (fim de semana compensado) não é falta.
 * Aceita também { mes: 'YYYY-MM' } por compatibilidade.
 */
const montarCartao = async (funcionarioId, filtro) => {
    const funcionario = await prisma.funcionario.findUnique({
        where: { id: funcionarioId },
        include: { jornadas: true }
    });
    if (!funcionario) {
        const err = new Error('Funcionário não encontrado');
        err.status = 404;
        throw err;
    }

    // ── Janela do período ────────────────────────────────────────────────────
    const f = typeof filtro === 'string' ? { mes: filtro } : (filtro || {});
    let de = f.de ? String(f.de).slice(0, 10) : '';
    let ate = f.ate ? String(f.ate).slice(0, 10) : '';
    if (!de || !ate) {
        const mesRef = f.mes || getDataReferencia().slice(0, 7);
        const [ano, mm] = mesRef.split('-').map(Number);
        de = `${mesRef}-01`;
        ate = new Date(ano, mm, 0).toLocaleDateString('en-CA');
    }
    if (de > ate) { const t = de; de = ate; ate = t; }

    const hoje = getDataReferencia();
    const admissao = funcionario.dataAdmissao ? getDataReferencia(funcionario.dataAdmissao) : null;
    const demissao = funcionario.dataDemissao ? getDataReferencia(funcionario.dataDemissao) : null;

    const jornadaPorDia = {};
    for (const j of funcionario.jornadas) jornadaPorDia[j.diaSemana] = j;

    const [registros, atestados, ocorrencias, feriados, ajuste] = await Promise.all([
        prisma.pontoRegistro.findMany({
            where: { funcionarioId, dataReferencia: { gte: de, lte: ate } },
            orderBy: { hora: 'asc' }
        }),
        prisma.funcionarioAtestado.findMany({ where: { funcionarioId } }),
        prisma.pontoOcorrencia.findMany({ where: { funcionarioId, data: { gte: de, lte: ate } } }),
        getFeriados(),
        prisma.folhaPeriodo.findUnique({ where: { funcionarioId_de_ate: { funcionarioId, de, ate } } }).catch(() => null)
    ]);

    // Agrupa batidas por dia
    const porDia = {};
    for (const r of registros) (porDia[r.dataReferencia] = porDia[r.dataReferencia] || []).push(r);

    // Marcações manuais do RH por dia
    const ocorPorDia = {};
    for (const o of ocorrencias) ocorPorDia[o.data] = o;

    // Dias cobertos por atestado (data inicial + nº de dias)
    const diasAtestado = new Set();
    for (const a of atestados) {
        const base = new Date(a.dataInicio);
        for (let i = 0; i < (a.dias || 1); i++) {
            const d = new Date(base);
            d.setDate(d.getDate() + i);
            diasAtestado.add(getDataReferencia(d));
        }
    }

    // ── Linha a linha (TODOS os dias do período) ─────────────────────────────
    let trabalhadoTotal = 0, previstoTotal = 0, saldoTotal = 0, extraMin = 0, negativoMin = 0;
    let faltas = 0, diasUteis = 0, domingos = 0, feriadosNaoDomingo = 0, diasTrabalhados = 0;
    let diasFerias = 0, diasAtestadoTotal = 0, diasAbonados = 0, diasAguardando = 0;
    const semanasComFalta = new Set();

    const linhas = listarDias(de, ate).map((d) => {
        const batidas = porDia[d] || [];
        const diaSemana = new Date(`${d}T12:00:00`).getDay();
        const jornada = jornadaPorDia[diaSemana];
        const cargaEscala = cargaDaJornada(jornada);
        const feriadoNome = feriados[d] || null;
        const ocor = ocorPorDia[d] || null;
        const foraDoContrato = (admissao && d < admissao) || (demissao && d > demissao);
        const trabalhado = trabalhadoDasBatidas(batidas);

        // Situação do dia — a marcação manual do RH manda em tudo
        let situacao;
        if (foraDoContrato) situacao = 'SEM_VINCULO';
        else if (ocor && TIPOS_MARCACAO.includes(ocor.tipo)) situacao = ocor.tipo;
        else if (feriadoNome) situacao = 'FERIADO';
        else if (diasAtestado.has(d)) situacao = 'ATESTADO';
        else if (batidas.length) situacao = 'TRABALHADO';
        // Sábado sem carga = jornada compensada na semana; domingo = descanso semanal
        else if (cargaEscala === 0) situacao = diaSemana === 6 ? 'COMPENSADO' : 'FOLGA';
        // O DIA DE HOJE nunca vira falta sozinho — a pessoa ainda pode bater o ponto.
        // Falta automática só em dia já fechado; hoje o RH marca à mão se quiser.
        else if (d >= hoje) situacao = 'FUTURO';
        // Quem não registra ponto nunca acumula falta pelo cartão
        else if (funcionario.registraPontoEm === 'NAO_REGISTRA') situacao = 'SEM_CONTROLE';
        // Quem bate no relógio da empresa: sem NENHUMA batida no período, o
        // arquivo ainda não foi importado — não é falta, é dado que falta chegar
        else if (funcionario.registraPontoEm === 'RELOGIO' && !registros.length) situacao = 'AGUARDANDO';
        else situacao = 'FALTA';

        // Carga que o dia exigia (mostrada na coluna "Previsto"): só nos dias em que
        // ele devia trabalhar — feriado, abono e folga não exigem nada.
        const cargaExigida = ['TRABALHADO', 'FALTA', 'FUTURO', 'AGUARDANDO'].includes(situacao) ? cargaEscala : 0;
        // Já o SALDO (banco de horas) só desconta a carga do dia efetivamente trabalhado:
        // falta não vira hora negativa — ela é descontada em dinheiro na folha.
        const previsto = situacao === 'TRABALHADO' ? cargaEscala : 0;
        const saldo = trabalhado - previsto;

        // Sem janela móvel, marca atraso quando a 1ª batida passa da entrada prevista
        let atraso = false;
        if (!funcionario.jornadaMovel && jornada && !jornada.folga && batidas.length) {
            const primeira = hmToMin(horaLocalHM(batidas[0].hora));
            const prevista = hmToMin(jornada.entrada1);
            if (prevista != null && primeira != null && primeira > prevista + 5) atraso = true;
        }

        trabalhadoTotal += trabalhado;
        previstoTotal += cargaExigida;
        saldoTotal += saldo;
        if (saldo > 0) extraMin += saldo;
        if (saldo < 0) negativoMin += -saldo;
        if (batidas.length) diasTrabalhados++;

        // Base do DSR: dias úteis × dias de repouso (domingos + feriados), pela ESCALA
        if (!foraDoContrato) {
            if (diaSemana === 0) domingos++;
            else if (feriadoNome) feriadosNaoDomingo++;
            else if (cargaEscala > 0) diasUteis++;
        }

        if (situacao === 'AGUARDANDO') diasAguardando++;
        if (situacao === 'FERIAS') diasFerias++;
        else if (situacao === 'ATESTADO') diasAtestadoTotal++;
        else if (situacao === 'ABONO') diasAbonados++;

        if (situacao === 'FALTA') {
            faltas++;
            // Semana do repouso (domingo a sábado) — 1 falta na semana derruba 1 DSR
            const dt = new Date(`${d}T12:00:00`);
            dt.setDate(dt.getDate() - dt.getDay());
            semanasComFalta.add(dt.toLocaleDateString('en-CA'));
        }

        return {
            data: d,
            diaSemana,
            situacao,
            situacaoRotulo: feriadoNome && situacao === 'FERIADO'
                ? feriadoNome
                : (situacao === 'FOLGA' && diaSemana === 0 ? 'Descanso' : ROTULO_SITUACAO[situacao]),
            marcadoManual: !!ocor,
            ocorrenciaId: ocor?.id || null,
            ocorrenciaObs: ocor?.obs || '',
            cargaEscalaMin: cargaEscala,
            previstoMin: cargaExigida,          // o que o dia exigia (coluna Previsto)
            previsto: cargaExigida ? minToHM(cargaExigida) : '—',
            previstoCobradoMin: previsto,       // o que entrou na conta do banco de horas
            trabalhadoMin: trabalhado,
            trabalhado: batidas.length ? minToHM(trabalhado) : '—',
            saldoMin: saldo,
            saldo: batidas.length || previsto ? minToHM(saldo) : '—',
            abonado: SITUACOES_ABONADAS.includes(situacao),
            atraso,
            folga: situacao === 'FOLGA' || situacao === 'COMPENSADO',
            batidas: batidas.map(mapBatida)
        };
    });

    // ── Folha do período ─────────────────────────────────────────────────────
    const salario = Number(funcionario.salario) || 0;
    const divisor = Number(funcionario.divisorHoras) || 220;
    const percHE = Number(funcionario.percentualHoraExtra ?? 50);
    const valorHora = salario > 0 ? salario / divisor : 0;
    const valorDia = salario > 0 ? salario / 30 : 0;
    const horaExtraPaga = funcionario.tipoHoraExtra === 'PAGA';

    const valorHoraExtra = horaExtraPaga ? (extraMin / 60) * valorHora * (1 + percHE / 100) : 0;
    const diasRepouso = domingos + feriadosNaoDomingo;
    const dsrSobreExtra = horaExtraPaga && diasUteis > 0 ? (valorHoraExtra / diasUteis) * diasRepouso : 0;

    const dsrPerdidos = funcionario.descontarDsrFalta ? Math.min(semanasComFalta.size, diasRepouso) : 0;
    const descontoFaltas = faltas * valorDia;
    const descontoDsr = dsrPerdidos * valorDia;

    const outrosProventos = Number(ajuste?.outrosProventos || 0);
    const outrosDescontos = Number(ajuste?.outrosDescontos || 0);

    const totalProventos = salario + valorHoraExtra + dsrSobreExtra + outrosProventos;
    const totalDescontos = descontoFaltas + descontoDsr + outrosDescontos;

    // O período cobre um mês fechado? (senão o salário base do cálculo não vale)
    const [anoDe, mesDe, diaDe] = de.split('-').map(Number);
    const ultimoDoMes = new Date(anoDe, mesDe, 0).toLocaleDateString('en-CA');
    const mesCheio = diaDe === 1 && ate === ultimoDoMes;

    return {
        funcionario: {
            id: funcionario.id,
            nome: funcionario.nome,
            cargo: funcionario.cargo || '',
            cpf: funcionario.cpf || '',
            dataAdmissao: funcionario.dataAdmissao,
            salario: cent(salario),
            registraPontoEm: funcionario.registraPontoEm,
            tipoHoraExtra: funcionario.tipoHoraExtra,
            percentualHoraExtra: percHE,
            divisorHoras: divisor,
            descontarDsrFalta: funcionario.descontarDsrFalta
        },
        periodo: { de, ate, mesCheio },
        mes: de.slice(0, 7), // compatibilidade
        resumo: {
            trabalhadoMin: trabalhadoTotal,
            trabalhado: minToHM(trabalhadoTotal),
            previstoMin: previstoTotal,
            previsto: minToHM(previstoTotal),
            saldoMin: saldoTotal,
            saldo: minToHM(saldoTotal),                 // banco de horas do período
            extraMin,
            extra: minToHM(extraMin),                   // horas além da carga do dia
            negativoMin,
            negativo: minToHM(negativoMin),
            extraValor: cent(valorHoraExtra),
            faltas,
            diasTrabalhados,
            diasUteis,
            diasRepouso,
            diasFerias,
            diasAtestado: diasAtestadoTotal,
            diasAbonados,
            diasAguardando
        },
        folha: {
            salarioBase: cent(salario),
            valorHora: cent(valorHora),
            valorDia: cent(valorDia),
            horaExtraPaga,
            percentualHoraExtra: percHE,
            extraMin,
            extraHoras: minToHM(extraMin),
            valorHoraExtra: cent(valorHoraExtra),
            dsrSobreExtra: cent(dsrSobreExtra),
            faltas,
            descontoFaltas: cent(descontoFaltas),
            dsrPerdidos,
            descontoDsr: cent(descontoDsr),
            outrosProventos: cent(outrosProventos),
            outrosDescontos: cent(outrosDescontos),
            obsAjuste: ajuste?.obs || '',
            totalProventos: cent(totalProventos),
            totalDescontos: cent(totalDescontos),
            liquido: cent(totalProventos - totalDescontos),
            diasUteis,
            diasRepouso,
            diasFerias,
            diasAtestado: diasAtestadoTotal,
            diasAbonados,
            mesCheio
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
    corrigirUltimaBatida,
    MINUTOS_CORRIGIR_ULTIMA,
    listarDias,
    getFeriados,
    montarCartao,
    TIPOS_MARCACAO,
    ROTULO_SITUACAO
};
